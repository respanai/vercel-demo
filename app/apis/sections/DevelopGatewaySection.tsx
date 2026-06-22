"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function DevelopGatewaySection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const demoCustomerIdentifier = "gateway_demo_user";

  const fixedPayload = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say 'Hello World'" }],
    customer_identifier: demoCustomerIdentifier,
    metadata: { source: "respan-demo", feature: "gateway" },
  };

  const [result, setResult] = useState<any>(null);
  const [deleteResult, setDeleteResult] = useState<any>(null);
  const [loading, setLoading] = useState<"create" | "delete" | null>(null);

  const run = async () => {
    setLoading("create");
    setResult(null);
    try {
      const data = await postProxy("/api/respan/gateway/chat-completions", respanApiKey, fixedPayload);
      setResult(data);
    } finally {
      setLoading(null);
    }
  };

  const deleteDemoUser = async () => {
    setLoading("delete");
    setDeleteResult(null);
    try {
      const data = await postProxy("/api/respan/users/delete", respanApiKey, {
        customer_identifier: demoCustomerIdentifier,
        environment: "prod",
      });
      setDeleteResult(data);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Develop → Gateway</h2>
        <p className="text-xs text-gray-600 mt-1">
          OpenAI-compatible endpoint: <span className="font-mono">POST /api/chat/completions</span>.
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <Card className="p-3 text-xs font-mono">
          {JSON.stringify(fixedPayload)}
        </Card>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button
          className="w-full py-3"
          onClick={run}
          disabled={loading !== null}
        >
          1) Create chat completion
        </Button>
        <Button className="w-full py-3" onClick={deleteDemoUser} disabled={loading !== null}>
          2) Delete demo user
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={result} emptyText={'Click "1) Create chat completion"'} />
        <JsonBlock title="Step 2 response" value={deleteResult} emptyText={'Click "2) Delete demo user"'} />
      </div>
    </div>
  );
}
