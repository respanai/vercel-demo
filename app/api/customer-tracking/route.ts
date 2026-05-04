/**
 * Customer Tracking Example
 * -------------------------
 * The minimal Vercel AI SDK + Respan recipe that populates the Customer
 * email / Customer name / Customer ID columns in the Spans table AND keeps
 * model / token / cost intact on every LLM span.
 *
 * No Respan helpers required -- just `generateText` with
 * `experimental_telemetry.metadata.customer_params`. The VercelAIInstrumentor
 * registered in `instrumentation.ts` captures the call as a blue LLM span
 * automatically.
 *
 * Required shape -- customer fields go INSIDE a `customer_params` object:
 *
 *   metadata: {
 *     customer_params: {
 *       customer_identifier: "user_42",
 *       email: "frank@respan.ai",
 *       name: "Frank",
 *     }
 *   }
 *
 * Anything outside `customer_params` is still persisted as raw metadata,
 * but only fields inside `customer_params` populate the Customer columns.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export const maxDuration = 30;

interface RequestBody {
  message: string;
  customerEmail: string;
  customerName: string;
  customerId: string;
}

export async function POST(req: Request) {
  const { message, customerEmail, customerName, customerId } =
    (await req.json()) as RequestBody;

  const apiKey =
    req.headers.get("x-respan-api-key")?.trim() || process.env.RESPAN_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Respan API key required (header x-respan-api-key or env RESPAN_API_KEY)." },
      { status: 400 }
    );
  }

  // Route LLM calls through Respan's gateway so cost + tokens are captured.
  const provider = createOpenAI({
    apiKey,
    baseURL: `${process.env.RESPAN_BASE_URL || "https://api.respan.ai"}/api`,
  });

  // Vercel AI SDK telemetry metadata must be flat (string/number/bool values),
  // so the customer_params object is JSON-stringified. Respan parses it back
  // into a structured object and uses it to populate the Customer columns.
  const customerParams = {
    customer_identifier: customerId,
    email: customerEmail,
    name: customerName,
  };

  const metadata = {
    customer_params: JSON.stringify(customerParams),
    // any extra attributes you care about live alongside customer_params:
    feature: "customer_tracking_demo",
    plan_tier: "pro",
  };

  try {
    const result = await generateText({
      model: provider("gpt-4o-mini"),
      system: "You are a friendly customer support assistant.",
      prompt: message,
      experimental_telemetry: {
        isEnabled: true,
        metadata,
      },
    });

    return Response.json({
      response: result.text,
      usage: result.usage,
      // Send the un-stringified shape to the UI so it renders nicely.
      metadataSent: { ...metadata, customer_params: customerParams },
      explanation:
        "Single bare generateText call. The blue 'ai.generateText' span in " +
        "Respan should show model=gpt-4o-mini, non-zero tokens/cost, and the " +
        "Customer email / name / ID columns populated from customer_params.",
    });
  } catch (error) {
    console.error("customer-tracking error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
