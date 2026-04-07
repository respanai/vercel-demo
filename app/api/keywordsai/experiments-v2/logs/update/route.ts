export const runtime = "nodejs";

function getKeywordsAIKey(req: Request): string | undefined {
  const fromEnv = process.env.KEYWORDSAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromHeader = req.headers.get("x-keywordsai-api-key")?.trim();
  return fromHeader || undefined;
}

export async function POST(req: Request) {
  const apiKey = getKeywordsAIKey(req);
  if (!apiKey) {
    return Response.json(
      { error: "Missing KEYWORDSAI_API_KEY (set env var or pass x-keywordsai-api-key header)." },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const experiment_id = String(body?.experiment_id || "").trim();
  const log_id = String(body?.log_id || "").trim();
  if (!experiment_id) return Response.json({ error: "experiment_id is required" }, { status: 400 });
  if (!log_id) return Response.json({ error: "log_id is required" }, { status: 400 });

  const { output } = body ?? {};
  const payload = output && typeof output === "object" ? { output } : { output: { output: "Updated by vercel-demo." } };

  const url = `https://api.respan.ai/api/v2/experiments/${encodeURIComponent(experiment_id)}/logs/${encodeURIComponent(
    log_id,
  )}`;
  const upstream = await fetch(url, {
    method: "PATCH",
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
      { error: "Upstream KeywordsAI request failed", status: upstream.status, response: json, url, request: payload },
      { status: upstream.status },
    );
  }

  return Response.json({ url, request: payload, response: json });
}


