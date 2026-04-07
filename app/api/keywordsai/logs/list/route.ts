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
  const {
    // query params
    page = 1,
    page_size = 20,
    sort_by = "-id",
    is_test = "false",
    all_envs = "false",
    fetch_filters = "false",
    start_time,
    end_time,
    include_fields,
    // POST body
    filters = {},
  } = body ?? {};

  const url = new URL("https://api.respan.ai/api/request-logs/list/");
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(page_size));
  url.searchParams.set("sort_by", String(sort_by));
  url.searchParams.set("is_test", String(is_test));
  url.searchParams.set("all_envs", String(all_envs));
  url.searchParams.set("fetch_filters", String(fetch_filters));
  if (start_time) url.searchParams.set("start_time", String(start_time));
  if (end_time) url.searchParams.set("end_time", String(end_time));
  if (include_fields) url.searchParams.set("include_fields", String(include_fields));

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


