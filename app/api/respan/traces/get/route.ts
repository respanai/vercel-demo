export const runtime = "nodejs";

import { getRespanApiKey, getRespanBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";

function getRespanKey(req: Request): string | undefined {
  return getRespanApiKey(req);
}

export async function POST(req: Request) {
  const apiKey = getRespanKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const body = await req.json().catch(() => ({}));
  const { trace_unique_id, environment, timestamp, start_time, end_time } = body ?? {};
  if (!trace_unique_id) {
    return Response.json({ error: "trace_unique_id is required" }, { status: 400 });
  }

  const url = new URL(`/api/traces/${encodeURIComponent(String(trace_unique_id))}/`, getRespanBaseUrl());
  if (environment) url.searchParams.set("environment", String(environment));
  if (timestamp) url.searchParams.set("timestamp", String(timestamp));
  if (start_time) url.searchParams.set("start_time", String(start_time));
  if (end_time) url.searchParams.set("end_time", String(end_time));

  const upstream = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const text = await upstream.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return Response.json(
      {
        error: "Upstream Respan request failed",
        status: upstream.status,
        response: json,
        url: url.toString(),
      },
      { status: upstream.status },
    );
  }

  return Response.json({ url: url.toString(), response: json });
}


