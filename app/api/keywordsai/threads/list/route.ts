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
  const { page = 1, page_size = 100, environment, filters = {} } = body ?? {};

  const url = new URL("https://api.respan.ai/api/log_threads/");
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(page_size));
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
        error: "Upstream KeywordsAI request failed",
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


