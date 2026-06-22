export const runtime = "nodejs";

import { getRespanApiKey, getRespanBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";

function getRespanKey(req: Request): string | undefined {
  return getRespanApiKey(req);
}

function normalizeExperimentPayload(body: any): any {
  const payload = { ...(body ?? {}) };
  if (!payload.workflow && payload.workflows) {
    payload.workflow = payload.workflows;
    delete payload.workflows;
  }
  return payload;
}

export async function POST(req: Request) {
  const apiKey = getRespanKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const body = await req.json().catch(() => ({}));
  const payload = normalizeExperimentPayload(body);
  const url = new URL("/api/v2/experiments/", getRespanBaseUrl()).toString();

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

