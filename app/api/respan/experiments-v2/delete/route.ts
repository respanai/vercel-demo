import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";
export const runtime = "nodejs";

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

  const url = `https://api.respan.ai/api/v2/experiments/${encodeURIComponent(experiment_id)}`;
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


