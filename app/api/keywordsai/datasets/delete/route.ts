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
  const dataset_id = String(body?.dataset_id || body?.id || "").trim();
  if (!dataset_id) return Response.json({ error: "dataset_id is required" }, { status: 400 });

  const url = `https://api.respan.ai/api/datasets/${encodeURIComponent(dataset_id)}/`;
  const upstream = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } });

  if (upstream.status === 204) {
    return Response.json({ url, response: "204 No Content" });
  }

  const text = await upstream.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : "204 No Content";
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return Response.json(
      { error: "Upstream KeywordsAI request failed", status: upstream.status, response: json, url },
      { status: upstream.status },
    );
  }

  return Response.json({ url, response: json });
}


