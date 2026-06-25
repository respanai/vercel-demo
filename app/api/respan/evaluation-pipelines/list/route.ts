export const runtime = "nodejs";

import { proxyRespan, readJson } from "../_proxy";

export async function POST(req: Request) {
  const body = await readJson(req);
  const filters = {
    ...(body.filters && typeof body.filters === "object" ? body.filters : {}),
    type: { value: ["evaluators"], operator: "eq" },
  };
  return proxyRespan(req, "POST", "/api/workflows/list/", {
    page: body.page ?? 1,
    page_size: body.page_size ?? 20,
    sort_by: body.sort_by ?? "-created_at",
    filters,
  });
}
