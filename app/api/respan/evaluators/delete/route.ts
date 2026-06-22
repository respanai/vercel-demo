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
  const evaluatorId = String(body?.evaluator_id || body?.evaluator_slug || body?.id || "").trim();
  if (!evaluatorId) return Response.json({ error: "evaluator_id is required" }, { status: 400 });

  const url = new URL(`/api/evaluators/${encodeURIComponent(evaluatorId)}/`, getRespanBaseUrl()).toString();
  const upstream = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } });

  if (upstream.status === 204) {
    return Response.json({ url, response: "204 No Content" });
  }

  const text = await upstream.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : "204 No Content";
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url },
      { status: upstream.status },
    );
  }

  return Response.json({ url, response: json });
}
