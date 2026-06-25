"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function RequireRespanApiKey(props: {
  respanApiKey: string;
  children: ReactNode;
}) {
  if (props.respanApiKey.trim()) {
    return <>{props.children}</>;
  }

  return (
    <Card variant="muted" className="p-4 text-xs text-gray-600">
      <p className="font-bold text-black">Respan API key required</p>
      <p className="mt-1">
        Enter a Respan API key in the API Keys panel to run this demo. Server
        routes ignore <span className="font-mono">RESPAN_API_KEY</span> from
        <span className="font-mono"> .env</span>,
        <span className="font-mono"> .env.local</span>, or Vercel environment
        variables for browser-driven examples.
      </p>
    </Card>
  );
}
