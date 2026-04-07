import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { withWorkflow, withTask, propagateAttributes } from "@respan/respan";

export const maxDuration = 30;

const SEC_REVIEW_SYSTEM_PROMPT = `You are an SEC compliance reviewer specializing in Rule 206(4)-1 (the Marketing Rule) for investment advisers. Analyze marketing content for potential violations.

For each piece of content, identify:
1. Statements that could be misleading
2. Performance claims without proper context
3. Testimonial/endorsement issues
4. Missing disclosures

Respond with JSON:
{
  "overall_status": "compliant" | "issues_found",
  "summary": "brief overall assessment",
  "findings": [
    {
      "id": 1,
      "category": "category name",
      "severity": "critical" | "moderate" | "minor",
      "flagged_text": "exact text from the content that is problematic",
      "rule_reference": "SEC rule section reference",
      "explanation": "why this is a violation",
      "suggestion": "how to fix it"
    }
  ]
}`;

export async function POST(req: Request) {
  const { content } = await req.json();

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

  const threadId = `sec_thread_${Date.now()}`;

  try {
    return await propagateAttributes(
      {
        customer_identifier: "sec_compliance_demo_user",
        thread_identifier: threadId,
        trace_group_identifier: "sec_compliance_workflow",
      },
      () =>
        withWorkflow({ name: "sec_compliance_review" }, async () => {
          const result = await withTask(
            { name: "compliance_review" },
            async () =>
              generateText({
                model: provider("gpt-4o-mini"),
                system: SEC_REVIEW_SYSTEM_PROMPT,
                prompt: `Review this marketing content for SEC compliance:\n\n${content}`,
                experimental_telemetry: {
                  isEnabled: true,
                  metadata: {
                    customer_identifier: "sec_compliance_demo_user",
                    thread_identifier: threadId,
                    agent: "SEC Compliance Reviewer",
                  },
                },
              })
          );

          let cleaned = result.text.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("Failed to parse compliance review response as JSON");
          }

          return Response.json({
            result: JSON.parse(jsonMatch[0]),
            metadata: {
              workflow: "sec-compliance",
              traceGroup: "sec_compliance_workflow",
            },
          });
        })
    );
  } catch (error) {
    console.error("SEC compliance review error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
