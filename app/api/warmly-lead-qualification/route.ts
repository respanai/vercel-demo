import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { withTask, propagateAttributes } from "@respan/respan";
import { getClient as getTracingSdk } from "@respan/tracing/dist/utils/tracing.js";
import { getRespanGatewayBaseUrl } from "@/lib/respan";
import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";

export const maxDuration = 60;

const WORKFLOW_NAME = "warmly-lead-qualification";
const TRACE_GROUP = "warmly-lead-qualification";
const CUSTOMER_IDENTIFIER = "warmly_demo_user";
const TRACER = trace.getTracer(WORKFLOW_NAME);

const LOG_TYPE_ATTR = "respan.entity.log_type";
const ENTITY_INPUT_ATTR = "traceloop.entity.input";
const ENTITY_OUTPUT_ATTR = "traceloop.entity.output";
const SPAN_KIND_ATTR = "traceloop.span.kind";
const WORKFLOW_NAME_ATTR = "traceloop.workflow.name";
const ENTITY_NAME_ATTR = "traceloop.entity.name";
const ENTITY_PATH_ATTR = "traceloop.entity.path";
const CUSTOMER_ID_ATTR = "respan.customer_params.customer_identifier";
const CUSTOMER_NAME_ATTR = "respan.customer_params.name";
const THREAD_ID_ATTR = "respan.threads.thread_identifier";
const SESSION_ID_ATTR = "respan.sessions.session_identifier";
const TRACE_GROUP_ATTR = "respan.trace.trace_group_identifier";
const METADATA_WORKFLOW_ATTR = "respan.metadata.workflow";
const METADATA_LEAD_EMAIL_ATTR = "respan.metadata.lead_email";
const METADATA_LEAD_COMPANY_ATTR = "respan.metadata.lead_company";

// ============================================================================
// TYPES
// ============================================================================

interface Lead { email: string; name: string; company: string; role: string; websiteVisits: number; pagesViewed: string[]; linkedinActivity: string; message?: string; }
interface EmailClassification { type: "real_person" | "generic_corp" | "bot" | "disposable"; confidence: number; reasoning: string; shouldContinue: boolean; }
interface CompanyEnrichment { estimatedSize: string; industry: string; likelyTechStack: string[]; fundingStage: string; headquarters: string; }
interface ICPScore { icpScore: number; tier: "A" | "B" | "C" | "D"; fitReasons: string[]; antiReasons: string[]; recommended: boolean; }
interface IntentAnalysis { intentScore: number; buyingStage: "awareness" | "consideration" | "decision" | "unknown"; hotSignals: string[]; urgency: "low" | "medium" | "high"; }
interface OutreachResult { routingDecision: "route_to_sdr" | "enroll_in_nurture" | "disqualify"; reasoning: string; emailSubject: string; emailBody: string; suggestedFollowUpDays: number; }
interface StepLog { step: number; name: string; status: "completed" | "skipped"; result: unknown; }

// ============================================================================
// HELPERS
// ============================================================================

function parseJSON<T>(text: string): T {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  return JSON.parse(match[0]);
}

type Provider = ReturnType<typeof createOpenAI>;

async function flushTracingWithoutShutdown() {
  try {
    const sdk = getTracingSdk() as
      | {
          _tracerProvider?: {
            forceFlush?: () => Promise<void>;
            activeSpanProcessor?: { forceFlush?: () => Promise<void> };
          };
        }
      | undefined;

    if (typeof sdk?._tracerProvider?.forceFlush === "function") {
      await sdk._tracerProvider.forceFlush();
      return;
    }

    if (typeof sdk?._tracerProvider?.activeSpanProcessor?.forceFlush === "function") {
      await sdk._tracerProvider.activeSpanProcessor.forceFlush();
      return;
    }

    const provider = trace.getTracerProvider() as {
      forceFlush?: () => Promise<void>;
      _delegate?: { forceFlush?: () => Promise<void> };
      getDelegate?: () => { forceFlush?: () => Promise<void> };
    };
    const delegate = provider?._delegate ?? provider?.getDelegate?.() ?? provider;
    await delegate?.forceFlush?.();
  } catch {
    // Best effort: do not fail the request because telemetry could not flush.
  }
}

function getTelemetryMetadata(threadId: string, agent: string) {
  return {
    customer_identifier: CUSTOMER_IDENTIFIER,
    thread_identifier: threadId,
    session_identifier: threadId,
    trace_group_identifier: TRACE_GROUP,
    customer_params: JSON.stringify({
      customer_identifier: CUSTOMER_IDENTIFIER,
      name: "Warmly Lead Qualification Demo",
    }),
    workflow: WORKFLOW_NAME,
    agent,
  };
}

async function withWarmlyWorkflowRoot<T>(
  params: { threadId: string; lead: Lead },
  fn: () => Promise<T>
): Promise<T> {
  const { threadId, lead } = params;

  return TRACER.startActiveSpan(`${WORKFLOW_NAME}.workflow`, async (span) => {
    span.setAttribute(LOG_TYPE_ATTR, "workflow");
    span.setAttribute(SPAN_KIND_ATTR, "workflow");
    span.setAttribute(WORKFLOW_NAME_ATTR, WORKFLOW_NAME);
    span.setAttribute(ENTITY_NAME_ATTR, WORKFLOW_NAME);
    span.setAttribute(ENTITY_PATH_ATTR, "");
    span.setAttribute(CUSTOMER_ID_ATTR, CUSTOMER_IDENTIFIER);
    span.setAttribute(CUSTOMER_NAME_ATTR, "Warmly Lead Qualification Demo");
    span.setAttribute(THREAD_ID_ATTR, threadId);
    span.setAttribute(SESSION_ID_ATTR, threadId);
    span.setAttribute(TRACE_GROUP_ATTR, TRACE_GROUP);
    span.setAttribute(METADATA_WORKFLOW_ATTR, WORKFLOW_NAME);
    span.setAttribute(METADATA_LEAD_EMAIL_ATTR, lead.email);
    span.setAttribute(METADATA_LEAD_COMPANY_ATTR, lead.company);
    span.setAttribute(ENTITY_INPUT_ATTR, JSON.stringify({ lead, thread_id: threadId }));

    try {
      const result = await fn();
      span.setAttribute(
        ENTITY_OUTPUT_ATTR,
        JSON.stringify({ status: "completed", workflow: WORKFLOW_NAME, thread_id: threadId })
      );
      return result;
    } catch (err) {
      if (err instanceof Error) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

// ============================================================================
// STEP IMPLEMENTATIONS
// ============================================================================

async function step1_classifyEmail(lead: Lead, provider: Provider, threadId: string): Promise<EmailClassification> {
  return withTask({ name: "email_classifier" }, async () => {
    const result = await generateText({
      model: provider("gpt-4o-mini"),
      system: `You are an email classifier. Analyze the lead and classify their email as: real_person, generic_corp, bot, or disposable. Respond with JSON: { "type": "...", "confidence": 0-1, "reasoning": "...", "shouldContinue": true/false }`,
      prompt: `Name: ${lead.name}\nEmail: ${lead.email}\nCompany: ${lead.company}\nRole: ${lead.role}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "warmly-email-classifier",
        metadata: getTelemetryMetadata(threadId, "Email Classifier"),
      },
    });
    return parseJSON<EmailClassification>(result.text);
  });
}

async function step2_enrichCompany(lead: Lead, provider: Provider, threadId: string): Promise<CompanyEnrichment> {
  return withTask({ name: "company_enricher" }, async () => {
    const result = await generateText({
      model: provider("gpt-4o-mini"),
      system: `You are a company data enricher. Estimate: size, industry, tech stack, funding stage, HQ. Respond with JSON: { "estimatedSize": "...", "industry": "...", "likelyTechStack": [...], "fundingStage": "...", "headquarters": "..." }`,
      prompt: `Company: ${lead.company}\nRole: ${lead.role}\nWebsite visits: ${lead.websiteVisits}\nPages: ${lead.pagesViewed.join(", ")}\nLinkedIn: ${lead.linkedinActivity}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "warmly-company-enricher",
        metadata: getTelemetryMetadata(threadId, "Company Enricher"),
      },
    });
    return parseJSON<CompanyEnrichment>(result.text);
  });
}

async function step3_scoreICP(lead: Lead, enrichment: CompanyEnrichment, provider: Provider, threadId: string): Promise<ICPScore> {
  return withTask({ name: "icp_scorer" }, async () => {
    const result = await generateText({
      model: provider("gpt-4o-mini"),
      system: `You are an ICP scorer for a B2B SaaS sales platform. Score 0-100, assign tier A/B/C/D. Respond with JSON: { "icpScore": 0-100, "tier": "A|B|C|D", "fitReasons": [...], "antiReasons": [...], "recommended": true/false }`,
      prompt: `Lead: ${lead.name}, ${lead.role} at ${lead.company}\nSize: ${enrichment.estimatedSize}\nIndustry: ${enrichment.industry}\nTech: ${enrichment.likelyTechStack.join(", ")}\nFunding: ${enrichment.fundingStage}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "warmly-icp-scorer",
        metadata: getTelemetryMetadata(threadId, "ICP Scorer"),
      },
    });
    return parseJSON<ICPScore>(result.text);
  });
}

async function step4_analyzeIntent(lead: Lead, enrichment: CompanyEnrichment, provider: Provider, threadId: string): Promise<IntentAnalysis> {
  return withTask({ name: "intent_analyzer" }, async () => {
    const result = await generateText({
      model: provider("gpt-4o-mini"),
      system: `You are a buying intent analyzer. Score intent 0-100. Respond with JSON: { "intentScore": 0-100, "buyingStage": "awareness|consideration|decision|unknown", "hotSignals": [...], "urgency": "low|medium|high" }`,
      prompt: `Lead: ${lead.name} at ${lead.company} (${enrichment.industry})\nRole: ${lead.role}\nVisits: ${lead.websiteVisits}\nPages: ${lead.pagesViewed.join(", ")}\nLinkedIn: ${lead.linkedinActivity}\nMessage: ${lead.message || "None"}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "warmly-intent-analyzer",
        metadata: getTelemetryMetadata(threadId, "Intent Analyzer"),
      },
    });
    return parseJSON<IntentAnalysis>(result.text);
  });
}

async function step5_generateOutreach(
  lead: Lead, emailResult: EmailClassification, enrichment: CompanyEnrichment,
  icpResult: ICPScore, intentResult: IntentAnalysis, provider: Provider, threadId: string
): Promise<OutreachResult> {
  return withTask({ name: "outreach_generator" }, async () => {
    const result = await generateText({
      model: provider("gpt-4o-mini"),
      system: `You are an outreach strategist. Decide routing and draft outreach. Respond with JSON: { "routingDecision": "route_to_sdr|enroll_in_nurture|disqualify", "reasoning": "...", "emailSubject": "...", "emailBody": "...", "suggestedFollowUpDays": number }`,
      prompt: `Lead: ${lead.name} <${lead.email}>, ${lead.role} at ${lead.company}\nEmail type: ${emailResult.type} (confidence: ${emailResult.confidence})\nCompany: ${enrichment.estimatedSize}, ${enrichment.industry}, ${enrichment.fundingStage}\nICP: ${icpResult.icpScore}/100 (${icpResult.tier})\nIntent: ${intentResult.intentScore}/100, Stage: ${intentResult.buyingStage}, Urgency: ${intentResult.urgency}\nSignals: ${intentResult.hotSignals.join("; ")}\nMessage: ${lead.message || "None"}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "warmly-outreach-generator",
        metadata: getTelemetryMetadata(threadId, "Outreach Generator"),
      },
    });
    return parseJSON<OutreachResult>(result.text);
  });
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(req: Request) {
  const { lead } = (await req.json()) as { lead: Lead };

  if (!lead?.email || !lead?.name || !lead?.company) {
    return Response.json({ error: "Lead name, email, and company are required.", steps: [] }, { status: 400 });
  }

  const apiKey = getRespanApiKey(req);

  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: getRespanGatewayBaseUrl(),
  });

  const threadId = `warmly_${lead.email}_${Date.now()}`;
  const steps: StepLog[] = [];

  try {
    const result = await propagateAttributes(
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        session_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
        metadata: {
          workflow: WORKFLOW_NAME,
          trace_group_identifier: TRACE_GROUP,
          thread_id: threadId,
          lead_email: lead.email,
          lead_company: lead.company,
        },
      },
      () =>
        withWarmlyWorkflowRoot({ threadId, lead }, async () => {
          const emailResult = await step1_classifyEmail(lead, provider, threadId);
          steps.push({ step: 1, name: "Email Classifier", status: "completed", result: emailResult });

          if (!emailResult.shouldContinue) {
            return {
              lead, steps, earlyExit: true,
              earlyExitReason: `Email classified as "${emailResult.type}" - pipeline stopped.`,
              metadata: { workflow: WORKFLOW_NAME, traceGroup: TRACE_GROUP, threadId },
            };
          }

          const enrichmentResult = await step2_enrichCompany(lead, provider, threadId);
          steps.push({ step: 2, name: "Company Enricher", status: "completed", result: enrichmentResult });

          const icpResult = await step3_scoreICP(lead, enrichmentResult, provider, threadId);
          steps.push({ step: 3, name: "ICP Scorer", status: "completed", result: icpResult });

          const intentResult = await step4_analyzeIntent(lead, enrichmentResult, provider, threadId);
          steps.push({ step: 4, name: "Intent Analyzer", status: "completed", result: intentResult });

          const outreachResult = await step5_generateOutreach(lead, emailResult, enrichmentResult, icpResult, intentResult, provider, threadId);
          steps.push({ step: 5, name: "Outreach Generator", status: "completed", result: outreachResult });

          return {
            lead, steps, earlyExit: false,
            summary: {
              emailType: emailResult.type, companySize: enrichmentResult.estimatedSize,
              industry: enrichmentResult.industry, icpScore: icpResult.icpScore,
              icpTier: icpResult.tier, intentScore: intentResult.intentScore,
              urgency: intentResult.urgency, routingDecision: outreachResult.routingDecision,
              emailSubject: outreachResult.emailSubject,
            },
            metadata: { workflow: WORKFLOW_NAME, traceGroup: TRACE_GROUP, threadId },
          };
        })
    );

    return Response.json(result);
  } catch (error) {
    console.error("Warmly lead qualification error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error", steps }, { status: 500 });
  } finally {
    await flushTracingWithoutShutdown();
  }
}
