import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { withWorkflow, withTask, propagateAttributes } from "@respan/respan";

export const maxDuration = 60;

const WORKFLOW_NAME = "warmly_lead_qualification";
const TRACE_GROUP = "warmly_lead_qualification";
const CUSTOMER_IDENTIFIER = "warmly_demo_user";

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
        metadata: { customer_identifier: CUSTOMER_IDENTIFIER, thread_identifier: threadId, agent: "Email Classifier" },
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
        metadata: { customer_identifier: CUSTOMER_IDENTIFIER, thread_identifier: threadId, agent: "Company Enricher" },
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
        metadata: { customer_identifier: CUSTOMER_IDENTIFIER, thread_identifier: threadId, agent: "ICP Scorer" },
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
        metadata: { customer_identifier: CUSTOMER_IDENTIFIER, thread_identifier: threadId, agent: "Intent Analyzer" },
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
        metadata: { customer_identifier: CUSTOMER_IDENTIFIER, thread_identifier: threadId, agent: "Outreach Generator" },
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

  const apiKey =
    req.headers.get("x-respan-api-key")?.trim() || process.env.RESPAN_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "API key is required. Set RESPAN_API_KEY or pass via header." },
      { status: 400 }
    );
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: `${process.env.RESPAN_BASE_URL || "https://api.respan.ai"}/api`,
  });

  const threadId = `warmly_${lead.email}_${Date.now()}`;
  const steps: StepLog[] = [];

  try {
    return await propagateAttributes(
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
      },
      () =>
        withWorkflow({ name: WORKFLOW_NAME }, async () => {
          const emailResult = await step1_classifyEmail(lead, provider, threadId);
          steps.push({ step: 1, name: "Email Classifier", status: "completed", result: emailResult });

          if (!emailResult.shouldContinue) {
            return Response.json({
              lead, steps, earlyExit: true,
              earlyExitReason: `Email classified as "${emailResult.type}" — pipeline stopped.`,
              metadata: { workflow: WORKFLOW_NAME, traceGroup: TRACE_GROUP },
            });
          }

          const enrichmentResult = await step2_enrichCompany(lead, provider, threadId);
          steps.push({ step: 2, name: "Company Enricher", status: "completed", result: enrichmentResult });

          const icpResult = await step3_scoreICP(lead, enrichmentResult, provider, threadId);
          steps.push({ step: 3, name: "ICP Scorer", status: "completed", result: icpResult });

          const intentResult = await step4_analyzeIntent(lead, enrichmentResult, provider, threadId);
          steps.push({ step: 4, name: "Intent Analyzer", status: "completed", result: intentResult });

          const outreachResult = await step5_generateOutreach(lead, emailResult, enrichmentResult, icpResult, intentResult, provider, threadId);
          steps.push({ step: 5, name: "Outreach Generator", status: "completed", result: outreachResult });

          return Response.json({
            lead, steps, earlyExit: false,
            summary: {
              emailType: emailResult.type, companySize: enrichmentResult.estimatedSize,
              industry: enrichmentResult.industry, icpScore: icpResult.icpScore,
              icpTier: icpResult.tier, intentScore: intentResult.intentScore,
              urgency: intentResult.urgency, routingDecision: outreachResult.routingDecision,
              emailSubject: outreachResult.emailSubject,
            },
            metadata: { workflow: WORKFLOW_NAME, traceGroup: TRACE_GROUP },
          });
        })
    );
  } catch (error) {
    console.error("Warmly lead qualification error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error", steps }, { status: 500 });
  }
}
