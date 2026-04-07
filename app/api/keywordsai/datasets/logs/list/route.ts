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
  const dataset_id = String(body?.dataset_id || "").trim();
  if (!dataset_id) return Response.json({ error: "dataset_id is required" }, { status: 400 });

  const { page = 1, page_size = 10 } = body ?? {};

  const url = new URL(`https://api.respan.ai/api/datasets/${encodeURIComponent(dataset_id)}/logs/list/`);
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
      { error: "Upstream KeywordsAI request failed", status: upstream.status, response: json, url: url.toString() },
      { status: upstream.status },
    );
  }

  return Response.json({ url: url.toString(), response: json });
}


