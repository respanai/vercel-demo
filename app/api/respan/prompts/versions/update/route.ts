export const runtime = "nodejs";

import { getRespanApiKey, getRespanBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";

function getRespanKey(req: Request): string | undefined {
  return getRespanApiKey(req);
}

function isVersionNumber(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

type VersionResolution =
  | { version: string; source: "version" | "resolved_from_prompt_version_id" }
  | { error: Response };

async function resolvePromptVersionReference(
  apiKey: string,
  promptId: string,
  reference: string,
): Promise<VersionResolution> {
  const trimmed = reference.trim();
  if (isVersionNumber(trimmed)) return { version: trimmed, source: "version" };

  const listUrl = new URL(`/api/prompts/${encodeURIComponent(promptId)}/versions/`, getRespanBaseUrl()).toString();
  const upstream = await fetch(listUrl, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await upstream.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!upstream.ok) {
    return {
      error: Response.json(
        { error: "Failed to resolve prompt version", status: upstream.status, response: json, url: listUrl },
        { status: upstream.status },
      ),
    };
  }

  const versions = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
  const match = versions.find((item: any) => {
    const candidates = [item?.prompt_version_id, item?.id, item?.promptVersionId].map((value) =>
      value === undefined || value === null ? "" : String(value),
    );
    return candidates.includes(trimmed);
  });
  const version = match?.version ?? match?.version_number;

  if (!version) {
    return {
      error: Response.json(
        {
          error: "Prompt version reference must be a version number or an existing prompt_version_id.",
          prompt_version_reference: trimmed,
          url: listUrl,
        },
        { status: 400 },
      ),
    };
  }

  return { version: String(version), source: "resolved_from_prompt_version_id" };
}

export async function POST(req: Request) {
  const apiKey = getRespanKey(req);
  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const body = await req.json().catch(() => ({}));
  const { prompt_id, version, prompt_version_id, ...patch } = body ?? {};
  if (!prompt_id) return Response.json({ error: "prompt_id is required" }, { status: 400 });
  const versionReference = String(version || prompt_version_id || "").trim();
  if (!versionReference) return Response.json({ error: "version is required" }, { status: 400 });

  const resolved = await resolvePromptVersionReference(apiKey, String(prompt_id), versionReference);
  if ("error" in resolved) return resolved.error;

  const url = new URL(
    `/api/prompts/${encodeURIComponent(String(prompt_id))}/versions/${encodeURIComponent(resolved.version)}/`,
    getRespanBaseUrl(),
  ).toString();
  const upstream = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch ?? {}),
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
    request: patch,
    resolved_version: resolved.version,
    version_reference_source: resolved.source,
    response: json,
  });
}

