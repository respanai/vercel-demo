"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface ApiResponse {
  response?: string;
  usage?: unknown;
  metadataSent?: Record<string, unknown>;
  logId?: string | null;
  gatewayRequestId?: string | null;
  explanation?: string;
  error?: string;
}

export function CustomerTrackingSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const [customerEmail, setCustomerEmail] = useState("frank@respan.ai");
  const [customerName, setCustomerName] = useState("Frank");
  const [customerId, setCustomerId] = useState("user_42");
  const [message, setMessage] = useState(
    "Why was I charged twice last month?"
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/customer-tracking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(respanApiKey && { "x-respan-api-key": respanApiKey }),
        },
        body: JSON.stringify({ message, customerEmail, customerName, customerId }),
      });
      const data: ApiResponse = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold">Customer email + custom properties</h2>
        <p className="text-xs text-gray-600 mt-1">
          Direct Respan gateway request with top-level{" "}
          <span className="font-mono">customer_params</span>,{" "}
          <span className="font-mono">metadata</span>, and{" "}
          <span className="font-mono">properties</span>. Populates customer columns,
          filterable metadata, native custom properties, and keeps model / tokens / cost intact.
        </p>
      </div>

      <Card variant="muted" className="p-4 space-y-3">
        <div>
          <Label className="mb-1 block">Customer email</Label>
          <Input
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
            disabled={loading}
          />
          <p className="text-[10px] text-gray-500 mt-1">
            Sent as <span className="font-mono">customer_params.email</span>.
          </p>
        </div>
        <div>
          <Label className="mb-1 block">Customer name</Label>
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Frank"
            disabled={loading}
          />
          <p className="text-[10px] text-gray-500 mt-1">
            Sent as <span className="font-mono">customer_params.name</span>.
          </p>
        </div>
        <div>
          <Label className="mb-1 block">Customer ID</Label>
          <Input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="user_42"
            disabled={loading}
          />
          <p className="text-[10px] text-gray-500 mt-1">
            Sent as <span className="font-mono">customer_params.customer_identifier</span>.
          </p>
        </div>
        <div>
          <Label className="mb-1 block">User message</Label>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask the assistant..."
            disabled={loading}
            onKeyDown={(e) => e.key === "Enter" && !loading && run()}
          />
        </div>
      </Card>

      <Button className="w-full py-3" onClick={run} disabled={loading || !message.trim()}>
        {loading ? "Running..." : "Send & log to Respan"}
      </Button>

      {result?.error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700 font-mono">{result.error}</p>
        </Card>
      )}

      {result && !result.error && (
        <div className="space-y-4">
          <Card className="p-4 border-2 border-black">
            <Label className="mb-2 block">Assistant response</Label>
            <p className="text-sm whitespace-pre-wrap">{result.response}</p>
          </Card>

          {(result.logId || result.gatewayRequestId) && (
            <Card variant="muted" className="p-4">
              <Label className="mb-2 block">Respan log IDs</Label>
              <div className="space-y-1 text-[11px] font-mono break-all">
                {result.logId && <p>log_id: {result.logId}</p>}
                {result.gatewayRequestId && <p>gateway_request_id: {result.gatewayRequestId}</p>}
              </div>
            </Card>
          )}

          <Card variant="muted" className="p-4">
            <Label className="mb-2 block">Fields sent to Respan</Label>
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(result.metadataSent, null, 2)}
            </pre>
            <p className="text-[10px] text-gray-500 mt-2">
              <span className="font-mono">metadata</span> is filterable with{" "}
              <span className="font-mono">metadata__*</span>.{" "}
              <span className="font-mono">properties</span> is native JSON and appears as
              custom properties in the log detail.
            </p>
          </Card>

          {result.usage != null && (
            <Card variant="muted" className="p-4">
              <Label className="mb-2 block">LLM usage</Label>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(result.usage, null, 2)}
              </pre>
            </Card>
          )}

          {result.explanation && (
            <Card className="p-4 border-green-200 bg-green-50">
              <p className="text-xs text-green-800">{result.explanation}</p>
            </Card>
          )}
        </div>
      )}

      <Card variant="muted" className="p-4">
        <Label className="mb-2 block">What to verify in Respan</Label>
        <ul className="text-xs text-gray-700 space-y-1 list-disc pl-4">
          <li>
            Logs view: <span className="font-mono">model</span> shows{" "}
            <span className="font-mono">gpt-4o-mini</span> with non-zero cost and tokens.
          </li>
          <li>
            Log columns: <strong>Customer email</strong>, <strong>Customer name</strong>, and{" "}
            <strong>Customer ID</strong> are populated.
          </li>
          <li>
            Log detail: <span className="font-mono">metadata</span> includes{" "}
            <span className="font-mono">feature</span> and{" "}
            <span className="font-mono">plan_tier</span>.
          </li>
          <li>
            Log detail: <span className="font-mono">properties</span> includes{" "}
            <span className="font-mono">account_region</span>,{" "}
            <span className="font-mono">billing_segment</span>,{" "}
            <span className="font-mono">seats</span>, and{" "}
            <span className="font-mono">renewal_risk</span>.
          </li>
        </ul>
      </Card>
    </div>
  );
}
