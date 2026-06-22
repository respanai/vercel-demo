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
  const { prompt_id, version, prompt_version_id } = body ?? {};
  if (!prompt_id) return Response.json({ error: "prompt_id is required" }, { status: 400 });
  const versionReference = String(version || prompt_version_id || "").trim();
  if (!versionReference) return Response.json({ error: "version is required" }, { status: 400 });

  const url = new URL(
    `/api/prompts/${encodeURIComponent(String(prompt_id))}/versions/${encodeURIComponent(versionReference)}/`,
    getRespanBaseUrl(),
  ).toString();
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

