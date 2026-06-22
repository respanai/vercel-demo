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
  const unique_id = String(body?.unique_id || body?.uniqueId || "").trim();
  if (!unique_id) {
    return Response.json({ error: "Missing unique_id" }, { status: 400 });
  }

  const url = `https://api.respan.ai/api/request-logs/${encodeURIComponent(unique_id)}/`;
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
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

  return Response.json({
    url,
    request: { unique_id },
    response: json,
  });
}


