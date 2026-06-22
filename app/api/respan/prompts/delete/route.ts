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
  const { prompt_id } = body ?? {};
  if (!prompt_id) return Response.json({ error: "prompt_id is required" }, { status: 400 });

  const url = `https://api.respan.ai/api/prompts/${encodeURIComponent(String(prompt_id))}/`;
  const upstream = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } });

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


