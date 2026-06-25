export const runtime = "nodejs";

import { proxyRespan, readJson } from "../_proxy";

export async function POST(req: Request) {
  const body = await readJson(req);
  const workflowId = String(body.workflow_id || body.pipeline_id || body.id || "").trim();
  if (!workflowId) return Response.json({ error: "workflow_id or pipeline_id is required" }, { status: 400 });

  return proxyRespan(req, "POST", "/api/workflow-runs/", {
    workflow_id: workflowId,
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    event_type: body.event_type || "eval_only",
  });
}
