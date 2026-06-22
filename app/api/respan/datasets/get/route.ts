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
  const dataset_id = String(body?.dataset_id || body?.id || "").trim();
  if (!dataset_id) return Response.json({ error: "dataset_id is required" }, { status: 400 });

  const url = `https://api.respan.ai/api/datasets/${encodeURIComponent(dataset_id)}/`;
  const upstream = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });

  const text = await upstream.text();
  let json: unknown;
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

  return Response.json({ url, response: json });
}


