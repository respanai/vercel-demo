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
  const experiment_id = String(body?.experiment_id || body?.id || "").trim();
  if (!experiment_id) return Response.json({ error: "experiment_id is required" }, { status: 400 });

  const { page = 1, page_size = 10, filters = {} } = body ?? {};
  const payload = { page, page_size, filters };

  const url = new URL(`/api/v2/experiments/${encodeURIComponent(experiment_id)}/logs/list/`, getRespanBaseUrl()).toString();
  const upstream = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url, request: payload },
      { status: upstream.status },
    );
  }

  return Response.json({ url, request: payload, response: json });
}
