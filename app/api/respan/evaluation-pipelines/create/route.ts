export const runtime = "nodejs";

import { proxyRespan, readJson } from "../_proxy";

export async function POST(req: Request) {
  const body = await readJson(req);
  return proxyRespan(req, "POST", "/api/workflows/", {
    ...body,
    type: "evaluators",
    trigger_event_type: "eval_only",
  });
}
