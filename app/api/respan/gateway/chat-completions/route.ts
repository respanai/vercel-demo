import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";

export const runtime = "nodejs";


export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const apiKey = getRespanApiKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const upstream = await fetch("https://api.respan.ai/api/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
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
      { error: "Upstream Respan request failed", status: upstream.status, response: json },
      { status: upstream.status },
    );
  }

  return Response.json({ url: "https://api.respan.ai/api/chat/completions", request: body, response: json });
}
