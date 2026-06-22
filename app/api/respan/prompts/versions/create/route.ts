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
  const { prompt_id, ...payload } = body ?? {};
  if (!prompt_id) return Response.json({ error: "prompt_id is required" }, { status: 400 });

  const url = new URL(`/api/prompts/${encodeURIComponent(String(prompt_id))}/versions/`, getRespanBaseUrl()).toString();
  const upstream = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
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
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url },
      { status: upstream.status },
    );
  }

  return Response.json({ url, request: payload, response: json });
}

