const DEFAULT_RESPAN_BASE_URL = "https://api.respan.ai";

export function getRespanBaseUrl(): string {
  const raw = process.env.RESPAN_BASE_URL?.trim() || DEFAULT_RESPAN_BASE_URL;
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

export function getRespanGatewayBaseUrl(): string {
  return `${getRespanBaseUrl()}/api`;
}

export const RESPAN_API_KEY_HEADER = "x-respan-api-key";

export const MISSING_USER_RESPAN_API_KEY_MESSAGE =
  "Missing Respan API key. Enter it in the API Keys panel before running this demo.";

export function getUserRespanApiKey(req: Request): string | undefined {
  const fromHeader = req.headers.get(RESPAN_API_KEY_HEADER)?.trim();
  return fromHeader || undefined;
}

export function getRespanApiKey(req: Request): string | undefined {
  return getUserRespanApiKey(req);
}

export function missingUserRespanApiKeyResponse(): Response {
  return Response.json({ error: MISSING_USER_RESPAN_API_KEY_MESSAGE }, { status: 401 });
}
