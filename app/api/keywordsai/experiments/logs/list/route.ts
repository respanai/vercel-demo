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
  const experiment_id = String(body?.experiment_id || body?.id || "").trim();
  if (!experiment_id) return Response.json({ error: "experiment_id is required" }, { status: 400 });

  const { page = 1, page_size = 10, filters = {} } = body ?? {};
  const payload = { page, page_size, filters };

  const url = `https://api.respan.ai/api/v2/experiments/${encodeURIComponent(experiment_id)}/logs/list/`;
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
      { error: "Upstream KeywordsAI request failed", status: upstream.status, response: json, url, request: payload },
      { status: upstream.status },
    );
  }

  return Response.json({ url, request: payload, response: json });
}


