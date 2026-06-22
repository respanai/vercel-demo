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
  const experiment_id = String(body?.experiment_id || "").trim();
  if (!experiment_id) return Response.json({ error: "experiment_id is required" }, { status: 400 });

  const url = new URL(`/api/v2/experiments/${encodeURIComponent(experiment_id)}/logs/list/`, getRespanBaseUrl());
  url.searchParams.set("export", "1");
  url.searchParams.set("page", String(body?.page ?? 1));
  url.searchParams.set("page_size", String(body?.page_size ?? 100));

  const upstream = await fetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });

  const text = await upstream.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url: url.toString() },
      { status: upstream.status },
    );
  }

  return Response.json({
    url: url.toString(),
    response: json,
    note: "Respan currently returns export-ready experiment log rows from the scoped logs list endpoint.",
  });
}
