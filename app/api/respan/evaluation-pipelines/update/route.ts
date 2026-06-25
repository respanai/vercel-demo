export const runtime = "nodejs";

import { getRespanApiKey, getRespanBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";
import { getPipelineId, readJson } from "../_proxy";

type UpstreamResult = {
  ok: boolean;
  status: number;
  url: string;
  request?: unknown;
  response: unknown;
};

async function callRespan(req: Request, method: string, path: string, body?: unknown): Promise<Response | UpstreamResult> {
  const apiKey = getRespanApiKey(req);
  if (!apiKey) return missingUserRespanApiKeyResponse();

  const url = new URL(path, getRespanBaseUrl()).toString();
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body ?? {});

  const upstream = await fetch(url, init);
  const text = await upstream.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return { ok: upstream.ok, status: upstream.status, url, request: body, response: json };
}

function resultResponse(result: UpstreamResult) {
  if (!result.ok) {
    return Response.json(
      {
        error: "Upstream Respan request failed",
        status: result.status,
        response: result.response,
        url: result.url,
        request: result.request,
      },
      { status: result.status },
    );
  }

  return Response.json({ url: result.url, request: result.request, response: result.response });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  const pipelineId = getPipelineId(body);
  if (!pipelineId) return Response.json({ error: "pipeline_id or workflow_id is required" }, { status: 400 });

  const payload: Record<string, unknown> = { ...body, type: "evaluators", trigger_event_type: "eval_only" };
  delete payload.pipeline_id;
  delete payload.workflow_id;
  delete payload.id;

  const encodedId = encodeURIComponent(pipelineId);
  const patchResult = await callRespan(req, "PATCH", `/api/workflows/${encodedId}/`, payload);
  if (patchResult instanceof Response) return patchResult;
  if (patchResult.ok || patchResult.status !== 409) return resultResponse(patchResult);

  const createDraftResult = await callRespan(req, "POST", `/api/workflows/${encodedId}/versions/`, payload);
  if (createDraftResult instanceof Response) return createDraftResult;
  if (!createDraftResult.ok) {
    return Response.json(
      {
        error: "Failed to update existing draft and failed to create a new draft version",
        patch_status: patchResult.status,
        patch_response: patchResult.response,
        create_draft_status: createDraftResult.status,
        create_draft_response: createDraftResult.response,
        url: createDraftResult.url,
        request: payload,
      },
      { status: createDraftResult.status },
    );
  }

  return Response.json({
    url: createDraftResult.url,
    request: payload,
    response: createDraftResult.response,
    fallback: {
      reason: "No editable draft existed, so a new draft version was created before commit.",
      original_patch_status: patchResult.status,
    },
  });
}
