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
  const { prompt_id, prompt_version_id } = body ?? {};
  if (!prompt_id) return Response.json({ error: "prompt_id is required" }, { status: 400 });
  if (!prompt_version_id) return Response.json({ error: "prompt_version_id is required" }, { status: 400 });

  const url = `https://api.respan.ai/api/prompts/${encodeURIComponent(String(prompt_id))}/versions/${encodeURIComponent(
    String(prompt_version_id),
  )}/`;
  const upstream = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } });

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


