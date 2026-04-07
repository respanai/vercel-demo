"use client";

export async function postProxy(path: string, respanApiKey: string, body: unknown) {
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


