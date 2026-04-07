const BASE = "https://api.respan.ai";

export async function callGateway(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ content: string; raw: unknown }> {
  const res = await fetch(`${BASE}/api/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`Gateway error ${res.status}: ${JSON.stringify(json)}`);
  const content = json?.choices?.[0]?.message?.content ?? "";
  return { content, raw: json };
}

export async function callRespan(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      `Respan ${method} ${url} failed (${res.status}): ${JSON.stringify(json)}`,
    );
  return json;
}

export function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

export interface ParetoEntry {
  version: number;
  scores: Record<string, number>;
  cost: number;
  latency: number;
}

export function dominatesCostScore(a: ParetoEntry, b: ParetoEntry): boolean {
  const avgA =
    Object.values(a.scores).reduce((s, v) => s + v, 0) /
    (Object.keys(a.scores).length || 1);
  const avgB =
    Object.values(b.scores).reduce((s, v) => s + v, 0) /
    (Object.keys(b.scores).length || 1);
  const betterOrEqualScore = avgA >= avgB;
  const betterOrEqualCost = a.cost <= b.cost;
  const strictlyBetter = avgA > avgB || a.cost < b.cost;
  return betterOrEqualScore && betterOrEqualCost && strictlyBetter;
}

export function computeParetoFrontier(
  candidates: ParetoEntry[],
): ParetoEntry[] {
  return candidates.filter(
    (c) => !candidates.some((o) => o !== c && dominatesCostScore(o, c)),
  );
}
