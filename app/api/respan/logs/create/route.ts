import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";
export const runtime = "nodejs";

function getRespanKey(req: Request): string | undefined {
  return getRespanApiKey(req);
}

function pickUniqueId(obj: any): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  return (
    obj.unique_id ||
    obj.uniqueId ||
    obj.id ||
    obj.log_unique_id ||
    obj.logUniqueId ||
    obj.log_id ||
    obj.logId ||
    undefined
  );
}

export async function POST(req: Request) {
  const apiKey = getRespanKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const body = await req.json().catch(() => ({}));
  const { customer_identifier = "user_demo_123", thread_identifier } = body ?? {};

  // Minimal demo log payload (matches Create log endpoint docs)
  const payload = {
    model: "gpt-4o-mini",
    prompt_messages: [{ role: "user", content: "Hello from Respan demo (create log)." }],
    completion_message: { role: "assistant", content: "Hello! This is a demo completion message." },
    // Make the event time explicit so it shows up in expected time windows.
    timestamp: new Date().toISOString(),
    // Used by Observe → Threads.
    ...(thread_identifier ? { thread_identifier: String(thread_identifier) } : {}),
    metadata: {
      source: "respan-demo",
      feature: "logs",
      customer_identifier,
    },
    customer_params: {
      customer_identifier,
    },
  };

  // Docs + examples use /api/request-logs/create/ for creating logs.
  // Posting to /api/request-logs/ can return a list-shaped response in some environments.
  const url = "https://api.respan.ai/api/request-logs/create/";
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url },
      { status: upstream.status },
    );
  }

  return Response.json({
    url,
    request: payload,
    unique_id: pickUniqueId(json),
    response: json,
  });
}


