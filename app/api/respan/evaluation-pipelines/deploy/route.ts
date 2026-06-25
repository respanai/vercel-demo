export const runtime = "nodejs";

import { getPipelineId, proxyRespan, readJson } from "../_proxy";

export async function POST(req: Request) {
  const body = await readJson(req);
  const pipelineId = getPipelineId(body);
  if (!pipelineId) return Response.json({ error: "pipeline_id or workflow_id is required" }, { status: 400 });
  const payload: Record<string, unknown> = {};
  if (body.version !== undefined) payload.version = body.version;
  return proxyRespan(req, "POST", `/api/workflows/${encodeURIComponent(pipelineId)}/deployments/`, payload);
}
