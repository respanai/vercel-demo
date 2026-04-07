import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { withWorkflow, withTask, propagateAttributes } from "@respan/respan";

export async function POST(req: Request) {
  const apiKey =
    req.headers.get("x-respan-api-key")?.trim() ||
    process.env.RESPAN_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "API key is required." },
      { status: 400 }
    );
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: `${process.env.RESPAN_BASE_URL || "https://api.respan.ai"}/api`,
  });

  const threadId = `warmly_generate_${Date.now()}`;

  try {
    return await propagateAttributes(
      {
        customer_identifier: "warmly_demo_user",
        thread_identifier: threadId,
        trace_group_identifier: "warmly_lead_qualification",
      },
      () =>
        withWorkflow({ name: "generate_lead" }, async () => {
          const result = await withTask(
            { name: "llm_generate_lead" },
            async () =>
              generateText({
                model: provider("claude-sonnet-4-5-20250929"),
                system: LEAD_GENERATOR_PROMPT,
                prompt: "Generate one random lead profile.",
                temperature: 0.9,
                experimental_telemetry: {
                  isEnabled: true,
                  metadata: {
                    customer_identifier: "warmly_demo_user",
                    thread_identifier: threadId,
                    agent: "Lead Generator",
                  },
                },
              })
          );

          let cleaned = result.text.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (!match) {
            return Response.json(
              { error: "Could not parse LLM response" },
              { status: 500 }
            );
          }

          return Response.json(JSON.parse(match[0]));
        })
    );
  } catch (error) {
    console.error("Generate lead error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

const LEAD_GENERATOR_PROMPT = `You are a realistic B2B lead data generator for a sales intelligence platform called Warmly. Generate a single fictional but realistic lead profile.

IMPORTANT: The distribution should be weighted toward HOT, BAD and TRICKY leads:
- ~25% hot leads (VP at funded SaaS, pricing page visits, inbound message)
- ~45% bad leads (personal emails, bots, competitors, students, unrelated industries, spam, job seekers)
- ~30% tricky/edge-case leads (looks good but isn't, looks bad but is good, ambiguous intent, mixed signals)

Respond with JSON only:
{
  "name": string,
  "email": string,
  "company": string,
  "role": string,
  "websiteVisits": number,
  "pagesViewed": string[],
  "linkedinActivity": string,
  "message": string | null
}`;
