"use client";

export async function postProxy(path: string, respanApiKey: string, body: unknown) {
  if (!respanApiKey.trim()) {
    return {
      status: 401,
      error: "Missing Respan API key. Enter it in the API Keys panel before running this demo.",
    };
  }

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(respanApiKey ? { "x-respan-api-key": respanApiKey } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}


