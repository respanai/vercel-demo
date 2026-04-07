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
  const unique_id = String(body?.unique_id || body?.uniqueId || "").trim();
  if (!unique_id) {
    return Response.json({ error: "Missing unique_id" }, { status: 400 });
  }

  const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : { demo_updated: true };
  const note = typeof body?.note === "string" ? body.note : "Updated from Keywords AI demo.";
  const positive_feedback =
    typeof body?.positive_feedback === "boolean" ? body.positive_feedback : true;

  const payload = {
    logs: [
      {
        unique_id,
        metadata,
        note,
        positive_feedback,
      },
    ],
  };

  const url = "https://api.respan.ai/api/request-logs/batch-update/";
  const upstream = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
      { error: "Upstream KeywordsAI request failed", status: upstream.status, response: json, url },
      { status: upstream.status },
    );
  }

  return Response.json({
    url,
    request: payload,
    response: json,
  });
}


