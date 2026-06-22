import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";
export const runtime = "nodejs";

function getRespanKey(req: Request): string | undefined {
  return getRespanApiKey(req);
}

function pickString(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function resolveLogContext(apiKey: string, uniqueId: string) {
  const detailUrl = `https://api.respan.ai/api/request-logs/${encodeURIComponent(uniqueId)}/`;
  const upstream = await fetch(detailUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!upstream.ok) {
    return { detailUrl, detailStatus: upstream.status, detail: null as unknown };
  }

  const detail = await upstream.json().catch(() => null);
  return { detailUrl, detailStatus: upstream.status, detail };
}

export async function POST(req: Request) {
  const apiKey = getRespanKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const body = await req.json().catch(() => ({}));
  const uniqueId = String(body?.unique_id || body?.uniqueId || "").trim();
  if (!uniqueId) {
    return Response.json({ error: "Missing unique_id" }, { status: 400 });
  }

  const note = typeof body?.note === "string" ? body.note : "Updated from Respan demo.";
  const positiveFeedback =
    typeof body?.positive_feedback === "boolean" ? body.positive_feedback : true;

  let uniqueOrganizationId = String(
    body?.unique_organization_id || body?.uniqueOrganizationId || body?.organization_id || "",
  ).trim();
  let timestamp = String(body?.timestamp || body?.start_time || body?.startTime || "").trim();
  let detailResolution: Awaited<ReturnType<typeof resolveLogContext>> | null = null;

  if (!uniqueOrganizationId || !timestamp) {
    detailResolution = await resolveLogContext(apiKey, uniqueId);
    if (detailResolution.detail) {
      uniqueOrganizationId ||= pickString(detailResolution.detail, [
        "unique_organization_id",
        "organization_id",
      ]);
      timestamp ||= pickString(detailResolution.detail, ["timestamp", "start_time"]);
    }
  }

  if (!uniqueOrganizationId || !timestamp) {
    return Response.json(
      {
        error:
          "Missing log annotation context. Create or retrieve the log first so unique_organization_id and timestamp are available.",
        detail_status: detailResolution?.detailStatus,
        detail_url: detailResolution?.detailUrl,
      },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    unique_organization_id: uniqueOrganizationId,
    timestamp,
  });
  const url = `https://api.respan.ai/clickhouse/log-annotations/${encodeURIComponent(uniqueId)}/?${params.toString()}`;
  const payload = { note, positive_feedback: positiveFeedback };

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
      { error: "Upstream Respan request failed", status: upstream.status, response: json, url },
      { status: upstream.status },
    );
  }

  return Response.json({
    url,
    request: { unique_id: uniqueId, unique_organization_id: uniqueOrganizationId, timestamp, ...payload },
    response: json,
  });
}
