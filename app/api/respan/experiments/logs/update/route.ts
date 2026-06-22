export const runtime = "nodejs";

import { getRespanApiKey, getRespanBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";

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

function buildNote(body: any): string {
  if (typeof body?.note === "string" && body.note.trim()) return body.note.trim();
  if (typeof body?.output === "string" && body.output.trim()) return body.output.trim();
  if (body?.output !== undefined) return `Experiment log update: ${JSON.stringify(body.output)}`;
  return "Experiment log checked from vercel-demo.";
}

async function readJson(upstream: Response): Promise<unknown> {
  const text = await upstream.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function POST(req: Request) {
  const apiKey = getRespanKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const body = await req.json().catch(() => ({}));
  const experiment_id = String(body?.experiment_id || "").trim();
  const log_id = String(body?.log_id || body?.id || "").trim();
  if (!experiment_id) return Response.json({ error: "experiment_id is required" }, { status: 400 });
  if (!log_id) return Response.json({ error: "log_id is required" }, { status: 400 });

  const detailUrl = new URL(
    `/api/v2/experiments/${encodeURIComponent(experiment_id)}/logs/${encodeURIComponent(log_id)}/`,
    getRespanBaseUrl(),
  ).toString();
  const detailUpstream = await fetch(detailUrl, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });
  const detail = await readJson(detailUpstream);

  if (!detailUpstream.ok) {
    return Response.json(
      { error: "Unable to retrieve experiment log before update", status: detailUpstream.status, response: detail, url: detailUrl },
      { status: detailUpstream.status },
    );
  }

  const uniqueOrganizationId =
    String(body?.unique_organization_id || body?.uniqueOrganizationId || "").trim() ||
    pickString(detail, ["unique_organization_id", "organization_id"]);
  const timestamp =
    String(body?.timestamp || body?.start_time || body?.startTime || "").trim() ||
    pickString(detail, ["timestamp", "start_time", "end_time"]);

  if (!uniqueOrganizationId || !timestamp) {
    return Response.json(
      {
        error: "Missing log annotation context. Retrieve the experiment log first so unique_organization_id and start_time are available.",
        experiment_log_detail_url: detailUrl,
      },
      { status: 400 },
    );
  }

  const annotationUrl = new URL(`/clickhouse/log-annotations/${encodeURIComponent(log_id)}/`, getRespanBaseUrl());
  annotationUrl.searchParams.set("unique_organization_id", uniqueOrganizationId);
  annotationUrl.searchParams.set("timestamp", timestamp);

  const payload = {
    note: buildNote(body),
    positive_feedback: typeof body?.positive_feedback === "boolean" ? body.positive_feedback : true,
  };

  const upstream = await fetch(annotationUrl.toString(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await readJson(upstream);

  if (!upstream.ok) {
    return Response.json(
      {
        error: "Upstream Respan request failed",
        status: upstream.status,
        response: json,
        url: annotationUrl.toString(),
        request: { log_id, unique_organization_id: uniqueOrganizationId, timestamp, ...payload },
        experiment_log_detail_url: detailUrl,
      },
      { status: upstream.status },
    );
  }

  return Response.json({
    url: annotationUrl.toString(),
    request: { log_id, unique_organization_id: uniqueOrganizationId, timestamp, ...payload },
    experiment_log_detail_url: detailUrl,
    response: json,
  });
}
