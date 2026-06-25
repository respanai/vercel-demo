export const runtime = "nodejs";

import { getPipelineId, proxyRespan, readJson } from "../_proxy";

export async function POST(req: Request) {
  const body = await readJson(req);
  const pipelineId = getPipelineId(body);
  if (!pipelineId) return Response.json({ error: "pipeline_id or workflow_id is required" }, { status: 400 });
  return proxyRespan(req, "POST", `/api/workflows/${encodeURIComponent(pipelineId)}/commits/`, {
    description: body.description || body.version_description || "Committed from Vercel demo.",
  });
}
