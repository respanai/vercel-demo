/**
 * Multi-tenant AI Service Desk — pipeline runner (streaming)
 * ----------------------------------------------------------
 * Runs ONE ticket for ONE tenant through the multi-agent service pipeline and
 * streams NDJSON step events so the ops console can animate the lane live. The
 * UI fires two of these in parallel ("fire both tenants") to show concurrent
 * multi-tenant traffic landing in Respan, cleanly separated by tenant.
 *
 * What this demonstrates, end to end:
 *   • Multi-tenant    → propagateAttributes({ customer_identifier }) + customer_params
 *   • Multi-agent     → withWorkflow → withAgent (per service) → withTool — the
 *                       distributed trace TREE, not tags
 *   • Prompt mgmt     → each service pulls its managed prompt from Respan at
 *                       runtime (GET /api/prompts/{id}), renders {{variables}};
 *                       a different prompt/version per tenant drives behavior
 *   • Gateway + AI SDK→ the rendered prompt runs via `generateText` through the
 *                       Respan gateway, so the VercelAIInstrumentor nests a real
 *                       LLM span under each agent → one clean trace per ticket
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { withWorkflow, withAgent, withTool, propagateAttributes } from "@respan/respan";
import {
  GATEWAY_BASE,
  getScenario,
  getTenant,
  SERVICES,
  type ServiceKey,
  type Scenario,
  type Tenant,
} from "../../examples/atomicworks/config";

export const maxDuration = 60;

interface RequestBody {
  tenantId: string;
  scenarioId: string;
}

// ---------------------------------------------------------------------------
// Mock backend tools (the "downstream services": AD / CMDB / KB / notifier)
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOOLS: Record<string, (ctx: ToolCtx) => Promise<Record<string, unknown>>> = {
  async classify_ticket() {
    await delay(60);
    return { ok: true };
  },
  async reset_access({ tenant }) {
    await delay(140);
    return {
      ticket: `ACC-${shortId()}`,
      directory: tenant.id === "northwind" ? "ActiveDirectory" : "Okta",
      action: "credential_reset",
      mfa_reenrolled: true,
    };
  },
  async upsert_ticket({ tenant }) {
    await delay(160);
    return {
      ticket: `INC-${shortId()}`,
      system: tenant.id === "northwind" ? "ServiceNow" : "Jira SM",
      status: "open",
      assignment_group: "endpoint-support",
    };
  },
  async rag_search({ tenant }) {
    await delay(120);
    return {
      hits: 3,
      kb: `${tenant.displayName} KB`,
      top_article: tenant.id === "northwind" ? "KB-Auth-VPN-2031" : "KB-Clinical-MFA-118",
    };
  },
  async send_notification() {
    await delay(70);
    return { channel: "email+slack", delivered: true };
  },
};

interface ToolCtx {
  tenant: Tenant;
  scenario: Scenario;
}

function shortId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

// ---------------------------------------------------------------------------
// Managed prompts (Respan prompt management) with inline fallback
// ---------------------------------------------------------------------------

const INLINE_PROMPTS: Record<ServiceKey, string> = {
  triage:
    "You are the triage service for {{tenant}}, a {{industry}} IT service desk. " +
    "Classify the request's category and priority, and state which specialist (Identity or Incident) should own it. " +
    "Reply in 2 short sentences.",
  identity:
    "You are the identity & access service for {{tenant}} ({{industry}}). " +
    "Decide the safe access-recovery action for the request, noting any verification or compliance step required. " +
    "Reply in 2 short sentences.",
  incident:
    "You are the incident management service for {{tenant}} ({{industry}}). " +
    "Summarize the incident, set a severity, and state the next action (search existing or open new). " +
    "Reply in 2 short sentences.",
  knowledge:
    "You are the knowledge service for {{tenant}} ({{industry}}). " +
    "Give the requester a concise, accurate answer or workaround grounded in standard {{industry}} IT policy. " +
    "Reply in 2 short sentences.",
  notification:
    "You are the notification service for {{tenant}} ({{industry}}). " +
    "Draft a one-sentence status update to send to the requester about how their ticket is being handled.",
};

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/**
 * Build the `X-Data-Respan-Params` header (base64 JSON). This is how we pass the
 * managed prompt reference (prompt_id + variables) and tracing params THROUGH the
 * Vercel AI SDK — the SDK strips unknown body fields, but it forwards custom
 * headers untouched. Respan renders the managed prompt server-side and links the
 * log to the prompt version, so we send only variables, not rendered text.
 */
function respanParamsHeader(params: Record<string, unknown>): Record<string, string> {
  return { "X-Data-Respan-Params": Buffer.from(JSON.stringify(params)).toString("base64") };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const { tenantId, scenarioId } = (await req.json()) as RequestBody;
  const apiKey = req.headers.get("x-respan-api-key")?.trim() || process.env.RESPAN_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Respan API key required (header x-respan-api-key or env RESPAN_API_KEY)." }, { status: 400 });
  }
  const tenant = getTenant(tenantId);
  const scenario = getScenario(scenarioId);
  if (!tenant || !scenario) {
    return Response.json({ error: "Unknown tenant or scenario." }, { status: 400 });
  }

  const ticketId = `TKT-${tenant.id.slice(0, 3).toUpperCase()}-${shortId()}`;
  const provider = createOpenAI({ apiKey, baseURL: `${GATEWAY_BASE}/api` });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      const promptVars = { tenant: tenant.displayName, industry: tenant.industry };
      const totals = { tokens: 0, ms: 0, services: 0, promptsManaged: 0 };

      // Which services run: triage → routed specialist → knowledge → notification
      const plan: ServiceKey[] = ["triage", scenario.route, "knowledge", "notification"];

      emit({ type: "ticket_start", ticketId, tenantId: tenant.id, scenario: scenario.label });

      try {
        await propagateAttributes(
          {
            customer_identifier: tenant.customerIdentifier,
            thread_identifier: ticketId,
            metadata: {
              workflow: "ticket.resolve",
              tenant: tenant.displayName,
              scenario: scenario.id,
            },
          },
          async () => {
            await withWorkflow({ name: "ticket.resolve" }, async () => {
              let triageNote = "";

              for (const key of plan) {
                const svc = SERVICES.find((s) => s.key === key)!;
                emit({ type: "service_start", service: key, label: svc.label, tool: svc.tool });
                const startedAt = Date.now();

                // Tag the whole agent subtree (agent + LLM + tool spans) with the
                // service name so the multi-agent split is filterable per agent
                // (metadata__agent) AND per tenant (customer_identifier) in Respan.
                await propagateAttributes({ metadata: { agent: key, service: key } }, async () => {
                  await withAgent({ name: `${key}-service` }, async () => {
                    const promptId = tenant.prompts[key];
                    const promptSource: "managed" | "inline" = promptId ? "managed" : "inline";

                    const userPrompt =
                      key === "triage"
                        ? `Incoming request:\n"${scenario.request}"`
                        : `Ticket ${ticketId}. Triage note: ${triageNote || "(n/a)"}\nRequest: "${scenario.request}"`;

                    // Managed prompt → reference it by id + variables via the gateway
                    // header (Respan renders server-side). Fallback → inline system.
                    const messages: Array<{ role: "system" | "user"; content: string }> = [
                      { role: "user", content: userPrompt },
                    ];
                    const gatewayParams: Record<string, unknown> = {
                      customer_identifier: tenant.customerIdentifier,
                      thread_identifier: ticketId,
                      metadata: { service: key, agent: key, workflow: "ticket.resolve", ticket_id: ticketId },
                    };
                    if (promptId) {
                      gatewayParams.prompt = {
                        prompt_id: promptId,
                        schema_version: 2,
                        variables: { ...promptVars, request: scenario.request, triage_note: triageNote },
                      };
                      totals.promptsManaged += 1;
                    } else {
                      messages.unshift({ role: "system", content: render(INLINE_PROMPTS[key], promptVars) });
                    }

                    // LLM call via AI SDK through the Respan gateway → nested span,
                    // with the managed-prompt reference carried in the header.
                    const result = await generateText({
                      model: provider(tenant.model),
                      messages,
                      headers: respanParamsHeader(gatewayParams),
                      experimental_telemetry: {
                        isEnabled: true,
                        functionId: `${key}-service`,
                        metadata: {
                          customer_params: JSON.stringify({
                            customer_identifier: tenant.customerIdentifier,
                            name: tenant.displayName,
                          }),
                          service: key,
                          agent: key,
                          workflow: "ticket.resolve",
                          ticket_id: ticketId,
                          ...(promptId ? { prompt_id: promptId } : {}),
                        },
                      },
                    });

                    const summary = result.text.trim();
                    if (key === "triage") triageNote = summary;
                    totals.tokens += result.usage?.totalTokens ?? 0;

                    // Backend tool call → nested withTool span.
                    let toolResult: Record<string, unknown> = {};
                    await withTool({ name: svc.tool }, async () => {
                      toolResult = await TOOLS[svc.tool]({ tenant, scenario });
                    });

                    const ms = Date.now() - startedAt;
                    totals.ms += ms;
                    totals.services += 1;
                    emit({
                      type: "service_done",
                      service: key,
                      label: svc.label,
                      summary,
                      tool: svc.tool,
                      toolResult,
                      promptSource,
                      tokens: result.usage?.totalTokens ?? 0,
                      ms,
                    });
                  });
                });
              }
            });
          }
        );

        emit({ type: "ticket_done", ticketId, totals });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Pipeline error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
