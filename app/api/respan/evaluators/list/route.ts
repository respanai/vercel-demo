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
  const { page = 1, page_size = 20 } = body ?? {};

  const url = new URL("/api/evaluators/", getRespanBaseUrl());
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(page_size));

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

  return Response.json({ url: url.toString(), response: json });
}
