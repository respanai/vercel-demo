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
  const {
    start_time,
    end_time,
    page = 1,
    page_size = 20,
    sort_by = "-timestamp",
    environment,
    filters = {},
  } = body ?? {};

  const url = new URL("/api/traces/list/", getRespanBaseUrl());
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(page_size));
  url.searchParams.set("sort_by", String(sort_by));
  if (start_time) url.searchParams.set("start_time", String(start_time));
  if (end_time) url.searchParams.set("end_time", String(end_time));
  if (environment) url.searchParams.set("environment", String(environment));

  const upstream = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filters }),
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
      {
        error: "Upstream Respan request failed",
        status: upstream.status,
        response: json,
        url: url.toString(),
      },
      { status: upstream.status },
    );
  }

  return Response.json({
    url: url.toString(),
    request: { filters },
    response: json,
  });
}


