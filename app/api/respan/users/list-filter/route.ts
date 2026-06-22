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
  const {
    page = 1,
    page_size = 50,
    sort_by = "-first_seen",
    environment = "prod",
    filters = {},
  } = body ?? {};

  const url = new URL("https://api.respan.ai/api/users/list/");
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(page_size));
  url.searchParams.set("sort_by", String(sort_by));
  if (environment) url.searchParams.set("environment", String(environment));

  const upstream = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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

  return Response.json({ url: url.toString(), request: { filters }, response: json });
}


