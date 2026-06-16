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
import { embed, generateText } from "ai";
import { trace } from "@opentelemetry/api";
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

// ---------------------------------------------------------------------------
// Custom span kinds (handoff). The standard with* helpers only emit
// workflow/task/agent/tool; we set `traceloop.span.kind` directly to record an
// agent-to-agent HANDOFF span, which the processor picks up like any other.
// ---------------------------------------------------------------------------

const TRACER = trace.getTracer("atomicworks");
// Canonical Respan attributes (verified against the backend ingestion):
//  - respan.entity.log_type   → Priority-1 explicit log_type override (→ "handoff")
//  - traceloop.entity.input/output → promoted to the real input/output columns
const LOG_TYPE_ATTR = "respan.entity.log_type";
const ENTITY_INPUT_ATTR = "traceloop.entity.input";
const ENTITY_OUTPUT_ATTR = "traceloop.entity.output";

/** Emit a typed "handoff" span recording one agent passing control to the next. */
async function emitHandoff(from: ServiceKey, to: ServiceKey, ticketId: string): Promise<void> {
  await TRACER.startActiveSpan(`handoff: ${from} → ${to}`, async (span) => {
    span.setAttribute(LOG_TYPE_ATTR, "handoff");
    span.setAttribute("traceloop.entity.name", `${from}-to-${to}`);
    // from/to belong in input/output, not custom properties.
    span.setAttribute(ENTITY_INPUT_ATTR, JSON.stringify({ from_agent: `${from}-service` }));
    span.setAttribute(ENTITY_OUTPUT_ATTR, JSON.stringify({ to_agent: `${to}-service` }));
    span.setAttribute("ticket_id", ticketId);
    span.end();
  });
}

/**
 * Fetch a DEPLOYED managed prompt from Respan and render its messages with the
 * given variables. We render client-side (rather than via the gateway prompt
 * object) so the fully-rendered prompt — including the {{request}} user turn —
 * lands in the trace span, while the prompt itself stays managed/versioned in
 * Respan (we tag prompt_id + version for filtering).
 */
async function fetchRenderedPrompt(
  apiKey: string,
  promptId: string,
  vars: Record<string, string>
): Promise<{ messages: Array<{ role: "system" | "user" | "assistant"; content: string }>; version?: number } | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/api/prompts/${encodeURIComponent(promptId)}/`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.live_version || data?.current_version;
    const msgs: Array<{ role: string; content: string }> = v?.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) return null;
    return {
      messages: msgs.map((m) => ({ role: m.role as "system" | "user" | "assistant", content: render(m.content, vars) })),
      version: v?.version,
    };
  } catch {
    return null;
  }
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

      // The workflow NAME reflects the ticket type, so the trace list has distinct,
      // filterable workflows (access-recovery vs incident-response) rather than one
      // generic "ticket.resolve" for everything.
      const workflowName = scenario.route === "identity" ? "access-recovery" : "incident-response";

      emit({ type: "ticket_start", ticketId, tenantId: tenant.id, scenario: scenario.label, workflow: workflowName });

      try {
        await propagateAttributes(
          {
            customer_identifier: tenant.customerIdentifier,
            thread_identifier: ticketId,
            metadata: {
              workflow: workflowName,
              tenant: tenant.displayName,
              scenario: scenario.id,
            },
          },
          async () => {
            await withWorkflow({ name: workflowName }, async () => {
              let triageNote = "";

              for (let i = 0; i < plan.length; i++) {
                const key = plan[i];
                const svc = SERVICES.find((s) => s.key === key)!;
                emit({ type: "service_start", service: key, label: svc.label, tool: svc.tool });
                const startedAt = Date.now();

                // Tag the whole agent subtree (agent + LLM + tool spans) with the
                // service name so the multi-agent split is filterable per agent
                // (metadata__agent) AND per tenant (customer_identifier) in Respan.
                await propagateAttributes({ metadata: { agent: key, service: key } }, async () => {
                  await withAgent({ name: `${key}-service` }, async () => {
                    const promptId = tenant.prompts[key];
                    // Variables fed into the managed prompt template. The request +
                    // triage note are real {{...}} variables now (rendered into the
                    // user turn of the prompt), so they show up in the trace.
                    const vars = {
                      ...promptVars,
                      request: scenario.request,
                      triage_note: key === "triage" ? "(this is the triage step)" : triageNote || "(n/a)",
                    };

                    // Pull the deployed managed prompt and render it client-side, so
                    // the full rendered prompt lands in the trace span. Inline fallback.
                    let messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
                    let promptVersion: number | undefined;
                    let promptSource: "managed" | "inline" = "inline";
                    const managed = promptId ? await fetchRenderedPrompt(apiKey, promptId, vars) : null;
                    if (managed) {
                      messages = managed.messages;
                      promptVersion = managed.version;
                      promptSource = "managed";
                      totals.promptsManaged += 1;
                    } else {
                      messages = [
                        { role: "system", content: render(INLINE_PROMPTS[key], promptVars) },
                        { role: "user", content: `Incoming request:\n${vars.request}\n\nTriage note: ${vars.triage_note}` },
                      ];
                    }

                    // LLM call via AI SDK through the Respan gateway → nested span.
                    const result = await generateText({
                      model: provider(tenant.model),
                      messages,
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
                          workflow: workflowName,
                          ticket_id: ticketId,
                          ...(promptId ? { prompt_id: promptId } : {}),
                          ...(promptVersion != null ? { prompt_version: promptVersion } : {}),
                        },
                      },
                    });

                    const summary = result.text.trim();
                    if (key === "triage") triageNote = summary;
                    totals.tokens += result.usage?.totalTokens ?? 0;

                    // Knowledge service embeds the query before retrieval → a real
                    // EMBEDDING span (the instrumentor classifies embed calls).
                    if (key === "knowledge") {
                      await embed({
                        model: provider.embedding("text-embedding-3-small"),
                        value: scenario.request,
                        experimental_telemetry: {
                          isEnabled: true,
                          functionId: "knowledge-embed-query",
                          metadata: {
                            customer_params: JSON.stringify({
                              customer_identifier: tenant.customerIdentifier,
                              name: tenant.displayName,
                            }),
                            service: key,
                            agent: key,
                            workflow: workflowName,
                            ticket_id: ticketId,
                          },
                        },
                      });
                    }

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
                      promptVersion,
                      tokens: result.usage?.totalTokens ?? 0,
                      ms,
                    });
                  });
                });

                // Record the handoff to the next agent (also a distinct span kind).
                if (i < plan.length - 1) {
                  const next = plan[i + 1];
                  await emitHandoff(key, next, ticketId);
                  emit({ type: "handoff", from: key, to: next });
                }
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
