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
  const { customer_identifier, environment, ...patch } = body ?? {};
  if (!customer_identifier) {
    return Response.json({ error: "customer_identifier is required" }, { status: 400 });
  }

  const url = new URL(`https://api.respan.ai/api/users/${encodeURIComponent(String(customer_identifier))}/`);
  if (environment) url.searchParams.set("environment", String(environment));

  const upstream = await fetch(url.toString(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
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

  return Response.json({ url: url.toString(), request: patch, response: json });
}


