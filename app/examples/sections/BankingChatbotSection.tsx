"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface WorkflowStep {
  agent: string;
  action: string;
  output: string;
  toolName?: string;
}

interface ChatbotResponse {
  response: string;
  steps: WorkflowStep[];
  toolUsed: string;
  toolResult: unknown;
  metadata: {
    workflow: string;
    promptId: string | null;
    traceGroup: string;
  };
  error?: string;
}

const EXAMPLE_PROMPTS = [
  "What is my current account balance?",
  "Show me my recent transactions",
  "What's the status of my pending wire transfers?",
  "I need help with a failed transaction",
  "What are my account settings?",
];

const AVAILABLE_TOOLS = [
  { name: "checkAccountBalance", desc: "Check account balance" },
  { name: "getTransactionHistory", desc: "Get recent transactions" },
  { name: "wireTransferStatus", desc: "Check wire transfer status" },
  { name: "createSupportTicket", desc: "Create support ticket" },
  { name: "getAccountInfo", desc: "Get account details" },
];

export function BankingChatbotSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  // Default prompt ID - user can override
  const [promptId, setPromptId] = useState("e43ac1e13a574d869c7864aeda9da8eb");
  const [message, setMessage] = useState("What is my current account balance?");
  const [result, setResult] = useState<ChatbotResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/banking-chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(respanApiKey && { "x-respan-api-key": respanApiKey }),
        },
        body: JSON.stringify({ message, promptId: promptId.trim() || undefined }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({
        response: "",
        steps: [],
        toolUsed: "none",
        toolResult: null,
        metadata: { workflow: "banking-chatbot", promptId: null, traceGroup: "" },
        error: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold">Banking Chatbot with Tool Calling</h2>
        <p className="text-xs text-gray-600 mt-1">
          AI-powered assistant that selects and executes banking tools. Full workflow traced via OpenTelemetry to Respan.
        </p>
      </div>

      {/* Prompt ID (optional) */}
      <Card variant="muted" className="p-4">
        <Label className="mb-2 block">Respan Prompt ID (optional)</Label>
        <Input
          value={promptId}
          onChange={(e) => setPromptId(e.target.value)}
          placeholder="Leave empty to use inline prompt"
          disabled={loading}
        />
        <p className="text-[10px] text-gray-500 mt-2">
          Default prompt ID is pre-filled. Clear to use inline prompt, or replace with your own Respan prompt ID.
        </p>
      </Card>

      {/* Message Input */}
      <Card variant="muted" className="p-4">
        <Label className="mb-2 block">Your Message</Label>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask the banking assistant..."
          disabled={loading}
          onKeyDown={(e) => e.key === "Enter" && !loading && ask()}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              className="text-[10px] px-2 py-1 border border-gray-200 hover:border-black transition-colors"
              onClick={() => setMessage(prompt)}
              disabled={loading}
            >
              {prompt}
            </button>
          ))}
        </div>
      </Card>

      {/* Submit Button */}
      <Button className="w-full py-3" onClick={ask} disabled={loading || !message.trim()}>
        {loading ? "Processing workflow..." : "Ask Banking Assistant"}
      </Button>

      {/* Error Display */}
      {result?.error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700 font-mono">{result.error}</p>
        </Card>
      )}

      {/* Results */}
      {result && !result.error && (
        <div className="space-y-6">
          {/* Final Response */}
          <Card className="p-4 border-2 border-black">
            <Label className="mb-2 block">Final Response</Label>
            <p className="text-sm">{result.response}</p>
            <div className="mt-3 flex gap-4 text-[10px] text-gray-500">
              <span>Tool: <span className="font-mono font-bold">{result.toolUsed}</span></span>
              <span>Trace Group: <span className="font-mono">{result.metadata.traceGroup}</span></span>
            </div>
          </Card>

          {/* Workflow Steps */}
          <div>
            <Label className="mb-3 block">Workflow Trace (3 Steps)</Label>
            <div className="space-y-4">
              {result.steps.map((step, idx) => (
                <Card key={idx} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold bg-black text-white px-2 py-0.5">
                      STEP {idx + 1}
                    </span>
                    <span className="text-xs font-bold">{step.agent}</span>
                    {step.toolName && (
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 font-mono">
                        {step.toolName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{step.action}</p>

                  {/* For Tool Selection step, show available tools with highlighting */}
                  {idx === 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] text-gray-500 mb-2">Available Tools:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {AVAILABLE_TOOLS.map((tool) => {
                          const isSelected = result.toolUsed === tool.name;
                          return (
                            <Card
                              key={tool.name}
                              className={`p-2 text-xs transition-all ${
                                isSelected
                                  ? "border-2 border-black bg-black text-white"
                                  : "opacity-50"
                              }`}
                            >
                              <span className="font-mono font-bold">{tool.name}</span>
                              <span className={isSelected ? "text-gray-300 ml-2" : "text-gray-400 ml-2"}>
                                {tool.desc}
                              </span>
                              {isSelected && (
                                <span className="ml-2">✓</span>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Card variant="muted" className="p-3">
                    <pre className="text-[10px] font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                      {step.output}
                    </pre>
                  </Card>
                </Card>
              ))}
            </div>
          </div>

          {/* Tool Result */}
          {result.toolResult != null && (
            <Card className="p-4">
              <Label className="mb-2 block">Raw Tool Result</Label>
              <Card variant="muted" className="p-3">
                <pre className="text-[10px] font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(result.toolResult, null, 2)}
                </pre>
              </Card>
            </Card>
          )}

          {/* Trace Confirmation */}
          <Card className="p-4 border-green-200 bg-green-50">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-lg">✓</span>
              <span className="text-xs font-bold text-green-700">Workflow traced to Respan</span>
            </div>
            <div className="mt-2 flex gap-4 text-[10px] text-green-600">
              <span>Trace Group: <span className="font-mono">{result.metadata.traceGroup}</span></span>
              <span>Prompt: <span className="font-mono">{result.metadata.promptId || "inline"}</span></span>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
