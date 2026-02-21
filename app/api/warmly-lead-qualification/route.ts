import OpenAI from "openai";
import { KeywordsAITelemetry } from "@keywordsai/tracing";

export const maxDuration = 60;

const WORKFLOW_NAME = "warmly_lead_qualification";
const TRACE_GROUP = "warmly_lead_qualification";
const CUSTOMER_IDENTIFIER = "warmly_demo_user";

const tracerByApiKey = new Map<string, KeywordsAITelemetry>();

function getTracer(apiKey: string): KeywordsAITelemetry {
  let tracer = tracerByApiKey.get(apiKey);
  if (!tracer) {
    tracer = new KeywordsAITelemetry({
      apiKey,
      baseURL: process.env.KEYWORDSAI_BASE_URL || "https://api.keywordsai.co",
      appName: "warmly-lead-qualification",
      disableBatch: true,
      instrumentModules: { openAI: OpenAI },
    });
    tracerByApiKey.set(apiKey, tracer);
  }
  return tracer;
}

// ============================================================================
// TYPES
// ============================================================================

interface Lead {
  email: string;
  name: string;
  company: string;
  role: string;
  websiteVisits: number;
  pagesViewed: string[];
  linkedinActivity: string;
  message?: string;
}

interface EmailClassification {
  type: "real_person" | "generic_corp" | "bot" | "disposable";
  confidence: number;
  reasoning: string;
  shouldContinue: boolean;
}

interface CompanyEnrichment {
  estimatedSize: string;
  industry: string;
  likelyTechStack: string[];
  fundingStage: string;
  headquarters: string;
}

interface ICPScore {
  icpScore: number;
  tier: "A" | "B" | "C" | "D";
  fitReasons: string[];
  antiReasons: string[];
  recommended: boolean;
}

interface IntentAnalysis {
  intentScore: number;
  buyingStage: "awareness" | "consideration" | "decision" | "unknown";
  hotSignals: string[];
  urgency: "low" | "medium" | "high";
}

interface OutreachResult {
  routingDecision: "route_to_sdr" | "enroll_in_nurture" | "disqualify";
  reasoning: string;
  emailSubject: string;
  emailBody: string;
  suggestedFollowUpDays: number;
}

interface StepLog {
  step: number;
  name: string;
  status: "completed" | "skipped";
  result: unknown;
}

interface SpanMetadata {
  agent: string;
  step: string;
  task: string;
}

// ============================================================================
// MOCK COMPANY DATABASE
// ============================================================================

const COMPANY_DATABASE: Record<
  string,
  {
    estimatedEmployees: number;
    industry: string;
    techStack: string[];
    fundingStage: string;
    headquarters: string;
    description: string;
  }
> = {
  rocketcrm: {
    estimatedEmployees: 52,
    industry: "B2B SaaS — CRM & Sales Enablement",
    techStack: ["React", "Node.js", "PostgreSQL", "AWS", "Segment", "HubSpot"],
    fundingStage: "Series A ($12M raised)",
    headquarters: "San Francisco, CA",
    description:
      "RocketCRM is a fast-growing sales engagement platform for mid-market B2B teams. Recently launched an AI-powered lead scoring feature.",
  },
  buildstuff: {
    estimatedEmployees: 8,
    industry: "Software Development Services",
    techStack: ["Next.js", "Tailwind", "Vercel", "GitHub"],
    fundingStage: "Bootstrapped",
    headquarters: "Austin, TX",
    description:
      "BuildStuff is a small dev agency specializing in MVP development for startups. Primarily a services business.",
  },
  randomcorp: {
    estimatedEmployees: 2500,
    industry: "Industrial Manufacturing",
    techStack: ["SAP", "Oracle ERP", "Salesforce"],
    fundingStage: "Public (NYSE: RND)",
    headquarters: "Detroit, MI",
    description:
      "RandomCorp manufactures industrial components. Large enterprise with legacy tech stack.",
  },
  techstartup: {
    estimatedEmployees: 25,
    industry: "B2B SaaS — Developer Tools",
    techStack: ["Python", "FastAPI", "PostgreSQL", "GCP", "Stripe"],
    fundingStage: "Seed ($3M raised)",
    headquarters: "New York, NY",
    description: "TechStartup.io builds developer productivity tools.",
  },
  growthloop: {
    estimatedEmployees: 85,
    industry: "B2B SaaS — Marketing Automation",
    techStack: ["React", "Python", "Snowflake", "AWS", "Segment", "Salesforce"],
    fundingStage: "Series A ($18M raised)",
    headquarters: "San Francisco, CA",
    description:
      "GrowthLoop helps marketing teams activate their data warehouse for campaigns.",
  },
  dataflow: {
    estimatedEmployees: 150,
    industry: "B2B SaaS — Data Infrastructure",
    techStack: ["Go", "Kubernetes", "Terraform", "AWS", "Snowflake", "dbt"],
    fundingStage: "Series B ($45M raised)",
    headquarters: "Seattle, WA",
    description:
      "DataFlow provides real-time data pipeline infrastructure for enterprise teams.",
  },
};

function lookupCompany(companyName: string) {
  const normalized = companyName.toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, data] of Object.entries(COMPANY_DATABASE)) {
    if (normalized.includes(key)) return data;
  }
  return {
    estimatedEmployees: 30,
    industry: "Unknown",
    techStack: ["Unknown"],
    fundingStage: "Unknown",
    headquarters: "Unknown",
    description: `No enrichment data found for "${companyName}".`,
  };
}

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


// ============================================================================
// PROMPT DEFINITIONS
// ============================================================================

const EMAIL_CLASSIFIER_PROMPT = `You are an email classification specialist for Warmly, a B2B sales intelligence platform. Analyze an email address and determine whether it belongs to a real person, a generic/role-based corporate address, a bot, or a disposable address.

Classification rules:
- "real_person": Email belongs to an actual individual. Usually contains first name, last name, or initials with a company domain. Examples: john.smith@acme.com, cto@techstartup.io.
- "generic_corp": Shared or role-based address not mapping to a specific person. Examples: info@company.com, sales@company.com, support@company.com.
- "bot": Auto-generated, spammy, or non-human. Examples: 1234xyz@gmail.com, test12345@yahoo.com.
- "disposable": Uses a known disposable email service. Examples: anything@mailinator.com, user@guerrillamail.com.

Set shouldContinue to false if classified as "bot" or "disposable". For "generic_corp", set shouldContinue to false if confidence >= 0.9. For "real_person", always set shouldContinue to true.

Respond with JSON: { "type": string, "confidence": number (0-1), "reasoning": string, "shouldContinue": boolean }`;

const ICP_SCORER_PROMPT = `You are an ICP scoring specialist for Warmly, a B2B sales intelligence platform.

Warmly's Ideal Customer Profile:
- B2B SaaS companies (strongly preferred)
- 10-500 employees (sweet spot: 50-200)
- Has a sales or marketing team doing outbound
- In growth mode: recently raised funding, hiring, or expanding
- Modern tech stack (cloud-based, API-driven)

Scoring rubric (0-100):
- Company type & industry fit: 0-30 points (B2B SaaS in sales/marketing tech: 25-30; other B2B SaaS: 15-25; B2B non-SaaS: 5-15; B2C/non-tech: 0-5)
- Company size fit: 0-25 points (50-200: 20-25; 10-50 or 200-500: 10-20; 1-10 or 500-1000: 3-10; 1000+: 0-5)
- Growth signals: 0-20 points (recent funding: +10; hiring sales/marketing: +5; revenue growth: +5)
- Role seniority & relevance: 0-25 points (VP/Director Sales/Marketing: 20-25; Head of Growth/Revenue: 15-20; Founder/CEO small co: 10-15; IC: 3-8; unrelated role: 0-5)

Tiers: A=75-100, B=50-74, C=25-49, D=0-24. Set recommended=true for A and B.

Respond with JSON: { "icpScore": number, "tier": string, "fitReasons": string[], "antiReasons": string[], "recommended": boolean }`;

const INTENT_ANALYZER_PROMPT = `You are a buying intent analysis specialist for Warmly. Analyze behavioral signals to determine buying readiness.

Signal weights:
- Pricing page visits: +15 each
- Product/features page visits: +8 each
- Case studies/testimonials: +10
- Blog/resources: +3 each
- Homepage only: +2
- High visit frequency (5+): strong multiplier
- LinkedIn mentioning sales tools/CRM/pipeline: +15
- LinkedIn job posting for sales/marketing: +15
- Inbound message: +20

Buying stages: awareness (0-30), consideration (31-60), decision (61-100), unknown (insufficient data).
Urgency: low (0-30), medium (31-65), high (66+).

Respond with JSON: { "intentScore": number, "buyingStage": string, "hotSignals": string[], "urgency": string }`;

const OUTREACH_GENERATOR_PROMPT = `You are a senior SDR at Warmly writing personalized outreach emails.

Routing rules:
- "route_to_sdr": A or B tier ICP with medium-to-high intent → personalized email with CTA for a call
- "enroll_in_nurture": C tier ICP or low intent → softer, educational email
- "disqualify": D tier ICP or generic/bot email → internal note only

Email guidelines:
- Subject lines under 50 chars, curiosity-driven
- Reference specific pages visited and LinkedIn activity
- For SDR: direct value prop, CTA for 15-min call
- For nurture: educational, share a resource
- For disqualify: internal reasoning only

Warmly helps B2B sales teams identify and engage website visitors in real-time, turning anonymous traffic into qualified pipeline.

Respond with JSON: { "routingDecision": string, "reasoning": string, "emailSubject": string, "emailBody": string, "suggestedFollowUpDays": number }`;

// ============================================================================
// STEP IMPLEMENTATIONS (OpenAI SDK + Keywords AI gateway)
// ============================================================================

async function step1_classifyEmail(
  lead: Lead,
  client: OpenAI,
  tracer: KeywordsAITelemetry,
  threadId: string
): Promise<EmailClassification> {
  const spanMetadata: SpanMetadata = {
    agent: "Email Classifier",
    step: "1",
    task: "email_classifier",
  };

  return await tracer.withTask({ name: "email_classifier" }, async () =>
    tracer.withKeywordsAISpanAttributes(
      async () => {
        const response = await client.chat.completions.create({
          model: "openai/gpt-5.1",
          messages: [],
          // KeywordsAI prompt management
          // @ts-expect-error
          prompt: {
            prompt_id: "2b3faab6e8204fb0bfc038191676ccbc",
            variables: {
              lead_name: lead.name,
              lead_email: lead.email,
              lead_company: lead.company,
              lead_role: lead.role,
            },
            override: true,
          },
          // KeywordsAI gateway parameters
          customer_identifier: CUSTOMER_IDENTIFIER,
          thread_identifier: threadId,
          trace_group_identifier: TRACE_GROUP,
          metadata: spanMetadata,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const text = response.choices[0].message.content || "";
        return parseJSON<EmailClassification>(text);
      },
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
        custom_identifier: "email_classifier",
        metadata: spanMetadata,
      }
    )
  );
}


async function step2_enrichCompany(
  lead: Lead,
  client: OpenAI,
  tracer: KeywordsAITelemetry,
  threadId: string
): Promise<CompanyEnrichment> {
  const spanMetadata: SpanMetadata = {
    agent: "Company Enricher",
    step: "2",
    task: "company_enricher",
  };

  return await tracer.withTask({ name: "company_enricher" }, async () =>
    tracer.withKeywordsAISpanAttributes(
      async () => {
        const companyData = lookupCompany(lead.company);

        const response = await client.chat.completions.create({
          model: "openai/gpt-5.1",
          messages: [],
          // @ts-expect-error Keywords AI prompt management
          prompt: {
            prompt_id: "10a9ed2b03384336b324200866560360",
            variables: {
              lead_company: lead.company,
              lead_role: lead.role,
              companyData: JSON.stringify(companyData, null, 2),
            },
            override: true,
          },
          // KeywordsAI gateway parameters
          customer_identifier: CUSTOMER_IDENTIFIER,
          thread_identifier: threadId,
          trace_group_identifier: TRACE_GROUP,
          metadata: spanMetadata,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const text = response.choices[0].message.content || "";
        return parseJSON<CompanyEnrichment>(text);
      },
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
        custom_identifier: "company_enricher",
        metadata: spanMetadata,
      }
    )
  );
}

async function step3_scoreICP(
  lead: Lead,
  enrichment: CompanyEnrichment,
  client: OpenAI,
  tracer: KeywordsAITelemetry,
  threadId: string
): Promise<ICPScore> {
  const spanMetadata: SpanMetadata = {
    agent: "ICP Scorer",
    step: "3",
    task: "icp_scorer",
  };

  return await tracer.withTask({ name: "icp_scorer" }, async () =>
    tracer.withKeywordsAISpanAttributes(
      async () => {
        const response = await client.chat.completions.create({
          model: "openai/gpt-5.1",
          messages: [],
          // @ts-expect-error Keywords AI prompt management
          prompt: {
            prompt_id: "2cb8f65cf1e14df5af637fa813c7c14c",
            variables: {
              lead_name: lead.name,
              lead_role: lead.role,
              lead_company: lead.company,
              enrichment_estimatedSize: enrichment.estimatedSize,
              enrichment_industry: enrichment.industry,
              enrichment_likelyTechStack: enrichment.likelyTechStack.join(", "),
              enrichment_fundingStage: enrichment.fundingStage,
              enrichment_headquarters: enrichment.headquarters,
            },
            override: true,
          },
          // KeywordsAI gateway parameters
          customer_identifier: CUSTOMER_IDENTIFIER,
          thread_identifier: threadId,
          trace_group_identifier: TRACE_GROUP,
          metadata: spanMetadata,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const text = response.choices[0].message.content || "";
        return parseJSON<ICPScore>(text);
      },
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
        custom_identifier: "icp_scorer",
        metadata: spanMetadata,
      }
    )
  );
}

async function step4_analyzeIntent(
  lead: Lead,
  enrichment: CompanyEnrichment,
  client: OpenAI,
  tracer: KeywordsAITelemetry,
  threadId: string
): Promise<IntentAnalysis> {
  const spanMetadata: SpanMetadata = {
    agent: "Intent Analyzer",
    step: "4",
    task: "intent_analyzer",
  };

  return await tracer.withTask({ name: "intent_analyzer" }, async () =>
    tracer.withKeywordsAISpanAttributes(
      async () => {
        const response = await client.chat.completions.create({
          model: "openai/gpt-5.1",
          messages: [],
          // @ts-expect-error Keywords AI prompt management
          prompt: {
            prompt_id: "0e953c709491427486cae50189f02d2c",
            variables: {
              lead_name: lead.name,
              lead_company: lead.company,
              enrichment_industry: enrichment.industry,
              enrichment_estimatedSize: enrichment.estimatedSize,
              lead_role: lead.role,
              lead_websiteVisits: String(lead.websiteVisits),
              lead_pagesViewed: lead.pagesViewed.join(", "),
              lead_linkedinActivity: lead.linkedinActivity || "No activity",
              lead_message: lead.message || "No inbound message",
            },
            override: true,
          },
          // KeywordsAI gateway parameters
          customer_identifier: CUSTOMER_IDENTIFIER,
          thread_identifier: threadId,
          trace_group_identifier: TRACE_GROUP,
          metadata: spanMetadata,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const text = response.choices[0].message.content || "";
        return parseJSON<IntentAnalysis>(text);
      },
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
        custom_identifier: "intent_analyzer",
        metadata: spanMetadata,
      }
    )
  );
}

async function step5_generateOutreach(
  lead: Lead,
  emailResult: EmailClassification,
  enrichment: CompanyEnrichment,
  icpResult: ICPScore,
  intentResult: IntentAnalysis,
  client: OpenAI,
  tracer: KeywordsAITelemetry,
  threadId: string
): Promise<OutreachResult> {
  const spanMetadata: SpanMetadata = {
    agent: "Outreach Generator",
    step: "5",
    task: "outreach_generator",
  };

  return await tracer.withTask({ name: "outreach_generator" }, async () =>
    tracer.withKeywordsAISpanAttributes(
      async () => {
        const response = await client.chat.completions.create({
          model: "openai/gpt-5.1",
          messages: [],
          // @ts-expect-error Keywords AI prompt management
          prompt: {
            prompt_id: "9a9f6eb476e94abaae2499c8d8a885fd",
            variables: {
              lead_name: lead.name,
              lead_email: lead.email,
              lead_role: lead.role,
              lead_company: lead.company,
              emailResult_type: emailResult.type,
              emailResult_confidence: String(emailResult.confidence),
              enrichment_estimatedSize: enrichment.estimatedSize,
              enrichment_industry: enrichment.industry,
              enrichment_fundingStage: enrichment.fundingStage,
              icpResult_icpScore: String(icpResult.icpScore),
              icpResult_tier: icpResult.tier,
              icpResult_fitReasons: icpResult.fitReasons.join("; "),
              icpResult_antiReasons: icpResult.antiReasons.join("; "),
              intentResult_intentScore: String(intentResult.intentScore),
              intentResult_buyingStage: intentResult.buyingStage,
              intentResult_urgency: intentResult.urgency,
              intentResult_hotSignals: intentResult.hotSignals.join("; "),
              lead_websiteVisits: String(lead.websiteVisits),
              lead_pagesViewed: lead.pagesViewed.join(", "),
              lead_linkedinActivity: lead.linkedinActivity || "None",
              lead_message: lead.message || "",
            },
            override: true,
          },
          // KeywordsAI gateway parameters
          customer_identifier: CUSTOMER_IDENTIFIER,
          thread_identifier: threadId,
          trace_group_identifier: TRACE_GROUP,
          metadata: spanMetadata,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const text = response.choices[0].message.content || "";
        return parseJSON<OutreachResult>(text);
      },
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        trace_group_identifier: TRACE_GROUP,
        custom_identifier: "outreach_generator",
        metadata: spanMetadata,
      }
    )
  );
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(req: Request) {
  const { lead } = (await req.json()) as { lead: Lead };

  const keywordsApiKey =
    req.headers.get("x-keywordsai-api-key")?.trim() ||
    process.env.KEYWORDSAI_API_KEY;

  if (!keywordsApiKey) {
    return Response.json(
      {
        error:
          "Keywords AI API key is required. Set KEYWORDSAI_API_KEY or pass via header.",
      },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.KEYWORDSAI_BASE_URL || "https://api.keywordsai.co";

  const client = new OpenAI({
    apiKey: keywordsApiKey,
    baseURL: `${baseUrl}/api/`,
  });

  const tracer = getTracer(keywordsApiKey);
  if (!tracer.isInitialized()) {
    await tracer.initialize();
  }
  const threadId = `warmly_${lead.email}_${Date.now()}`;

  const steps: StepLog[] = [];

  try {
    return await tracer.withWorkflow(
      { name: WORKFLOW_NAME },
      async () =>
        tracer.withKeywordsAISpanAttributes(
          async () => {
            // Step 1 — Email Classifier
            const emailResult = await step1_classifyEmail(lead, client, tracer, threadId);
            steps.push({ step: 1, name: "Email Classifier", status: "completed", result: emailResult });

            if (!emailResult.shouldContinue) {
              return Response.json({
                lead,
                steps,
                earlyExit: true,
                earlyExitReason: `Email classified as "${emailResult.type}" — pipeline stopped.`,
                metadata: {
                  workflow: "warmly-lead-qualification",
                  traceGroup: TRACE_GROUP,
                },
              });
            }

            // Step 2 — Company Enricher
            const enrichmentResult = await step2_enrichCompany(lead, client, tracer, threadId);
            steps.push({ step: 2, name: "Company Enricher", status: "completed", result: enrichmentResult });

            // Step 3 — ICP Scorer
            const icpResult = await step3_scoreICP(lead, enrichmentResult, client, tracer, threadId);
            steps.push({ step: 3, name: "ICP Scorer", status: "completed", result: icpResult });

            // Step 4 — Intent Analyzer
            const intentResult = await step4_analyzeIntent(lead, enrichmentResult, client, tracer, threadId);
            steps.push({ step: 4, name: "Intent Analyzer", status: "completed", result: intentResult });

            // Step 5 — Outreach Generator
            const outreachResult = await step5_generateOutreach(
              lead,
              emailResult,
              enrichmentResult,
              icpResult,
              intentResult,
              client,
              tracer,
              threadId
            );
            steps.push({ step: 5, name: "Outreach Generator", status: "completed", result: outreachResult });

            return Response.json({
              lead,
              steps,
              earlyExit: false,
              summary: {
                emailType: emailResult.type,
                companySize: enrichmentResult.estimatedSize,
                industry: enrichmentResult.industry,
                icpScore: icpResult.icpScore,
                icpTier: icpResult.tier,
                intentScore: intentResult.intentScore,
                urgency: intentResult.urgency,
                routingDecision: outreachResult.routingDecision,
                emailSubject: outreachResult.emailSubject,
              },
              metadata: {
                workflow: "warmly-lead-qualification",
                traceGroup: TRACE_GROUP,
              },
            });
          },
          {
            customer_identifier: CUSTOMER_IDENTIFIER,
            thread_identifier: threadId,
            trace_group_identifier: TRACE_GROUP,
            custom_identifier: WORKFLOW_NAME,
            metadata: { workflow: WORKFLOW_NAME },
          }
        )
    );
  } catch (error) {
    console.error("Warmly lead qualification error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        steps,
      },
      { status: 500 }
    );
  }
}
