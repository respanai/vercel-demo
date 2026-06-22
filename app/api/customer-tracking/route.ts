import { getRespanGatewayBaseUrl } from "@/lib/respan";
import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";

/**
 * Customer Tracking Example
 * -------------------------
 * Sends a chat completion through the Respan gateway with the fields the
 * gateway persists on the request log:
 *
 *   customer_params -> Customer email / name / ID columns
 *   metadata        -> filterable custom metadata (metadata__feature, etc.)
 *   properties      -> native JSON custom properties on the log detail
 */

export const maxDuration = 30;

interface RequestBody {
  message: string;
  customerEmail: string;
  customerName: string;
  customerId: string;
}

interface GatewayChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: unknown;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  const { message, customerEmail, customerName, customerId } =
    (await req.json()) as RequestBody;

  const userMessage = typeof message === "string" ? message.trim() : "";
  if (!userMessage) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  const apiKey = getRespanApiKey(req);

  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const customerParams = {
    customer_identifier: customerId || "user_42",
    email: customerEmail || "frank@respan.ai",
    name: customerName || "Frank",
  };

  const metadata = {
    source: "vercel-demo",
    feature: "customer_tracking_demo",
    plan_tier: "pro",
    example: "customer_email_cost_tracking",
  };

  const properties = {
    account_region: "us-east",
    billing_segment: "self_serve",
    seats: 12,
    renewal_risk: false,
  };

  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a friendly customer support assistant." },
      { role: "user", content: userMessage },
    ],
    customer_params: customerParams,
    metadata,
    properties,
  };

  const url = `${getRespanGatewayBaseUrl()}/chat/completions`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let data: GatewayChatCompletion | Record<string, unknown>;
    try {
      data = JSON.parse(text) as GatewayChatCompletion;
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      return Response.json(
        { error: "Upstream Respan gateway request failed", status: upstream.status, response: data },
        { status: upstream.status }
      );
    }

    const completion = data as GatewayChatCompletion;
    const response = completion.choices?.[0]?.message?.content ?? "";
    const logId = upstream.headers.get("x-respan-log-id");
    const gatewayRequestId = upstream.headers.get("x-respan-gateway-request-id");

    return Response.json({
      response,
      usage: completion.usage,
      logId,
      gatewayRequestId,
      metadataSent: {
        customer_params: customerParams,
        metadata,
        properties,
      },
      explanation:
        "Direct Respan gateway chat completion. The request log should show customer email/name/ID, filterable metadata, and native custom properties.",
    });
  } catch (error) {
    console.error("customer-tracking error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
