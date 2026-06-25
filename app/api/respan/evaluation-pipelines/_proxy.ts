import { getRespanApiKey, getRespanBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function getPipelineId(body: Record<string, unknown>): string {
  return String(body.pipeline_id || body.workflow_id || body.id || "").trim();
}

export async function proxyRespan(req: Request, method: string, path: string, body?: unknown) {
  const apiKey = getRespanApiKey(req);
  if (!apiKey) return missingUserRespanApiKeyResponse();

  const url = new URL(path, getRespanBaseUrl()).toString();
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body ?? {});

  const upstream = await fetch(url, init);
  if (upstream.status === 204) return Response.json({ url, response: "204 No Content" });

  const text = await upstream.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url, request: body },
      { status: upstream.status },
    );
  }

  return Response.json({ url, request: body, response: json });
}
