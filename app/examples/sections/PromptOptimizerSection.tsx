"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RadarMetric {
  label: string;
  value: number;
  maxValue?: number;
  isBuiltIn?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score < 5) return "text-red-600";
  if (score < 7) return "text-yellow-600";
  return "text-green-600";
}

function formatCost(cost: number): string {
  const per1k = cost * 1000;
  if (per1k < 0.01) return `$${(per1k * 100).toFixed(2)}c/1k`;
  return `$${per1k.toFixed(2)}/1k`;
}

// ---------------------------------------------------------------------------
// RadarChart — SVG spider/radar chart
// ---------------------------------------------------------------------------

function RadarChart({
  metrics,
  comparison,
  size = 280,
}: {
  metrics: RadarMetric[];
  comparison?: RadarMetric[];
  size?: number;
}) {
  const n = metrics.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 40;
  const levels = [2, 4, 6, 8, 10];
  const angleStep = (2 * Math.PI) / n;

  const pointAt = (i: number, value: number, max: number) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = (value / max) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const polygonPoints = (data: RadarMetric[]) =>
    data
      .map((m, i) => {
        const p = pointAt(i, m.value, m.maxValue ?? 10);
        return `${p.x},${p.y}`;
      })
      .join(" ");

  const gridPolygon = (level: number) =>
    Array.from({ length: n }, (_, i) => {
      const p = pointAt(i, level, 10);
      return `${p.x},${p.y}`;
    }).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[280px] mx-auto"
      style={{ fontFamily: "ui-monospace, monospace" }}
    >
      {/* Grid levels */}
      {levels.map((level) => (
        <polygon
          key={`grid-${level}`}
          points={gridPolygon(level)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />
      ))}

      {/* Axis lines */}
      {metrics.map((_, i) => {
        const p = pointAt(i, 10, 10);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#e5e7eb"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Comparison polygon (previous iteration) */}
      {comparison && comparison.length === n && (
        <polygon
          points={polygonPoints(comparison)}
          fill="none"
          stroke="#9ca3af"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.6}
        />
      )}

      {/* Current scores polygon */}
      <polygon
        points={polygonPoints(metrics)}
        fill="rgba(0,0,0,0.06)"
        stroke="#000"
        strokeWidth={1.5}
      />

      {/* Score dots */}
      {metrics.map((m, i) => {
        const p = pointAt(i, m.value, m.maxValue ?? 10);
        return (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="#000"
          />
        );
      })}

      {/* Labels */}
      {metrics.map((m, i) => {
        const labelR = radius + 24;
        const angle = -Math.PI / 2 + i * angleStep;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        const anchor =
          Math.abs(Math.cos(angle)) < 0.1
            ? "middle"
            : Math.cos(angle) > 0
              ? "start"
              : "end";
        return (
          <g key={`label-${i}`}>
            <text
              x={lx}
              y={ly - 4}
              textAnchor={anchor}
              fontSize={8}
              fill="#6b7280"
            >
              {m.isBuiltIn ? "* " : ""}
              {m.label}
            </text>
            <text
              x={lx}
              y={ly + 7}
              textAnchor={anchor}
              fontSize={9}
              fill="#000"
              fontWeight="bold"
            >
              {m.value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tool result renderers
// ---------------------------------------------------------------------------

function FetchPromptResult({ result }: { result: any }) {
  return (
    <Card className="p-3 text-xs border-0 bg-transparent space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold">Prompt: {result.name}</span>
        <span className="text-gray-500 font-mono text-[10px]">
          v{result.deployed_version}
        </span>
      </div>
      {result.variables?.length > 0 && (
        <div className="text-gray-600">
          Variables:{" "}
          {result.variables.map((v: string) => (
            <span
              key={v}
              className="inline-block bg-gray-100 px-1.5 py-0.5 mr-1 font-mono text-[10px]"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}
      {result.messages?.slice(0, 2).map((m: any, i: number) => {
        const content =
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
              ? m.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("")
              : m.content?.text ?? JSON.stringify(m.content);
        return (
          <div key={i} className="border-t border-gray-200 pt-1">
            <span className="font-bold text-gray-500 text-[10px] uppercase">
              {m.role}
            </span>
            <p className="text-gray-700 mt-0.5 line-clamp-3">{content}</p>
          </div>
        );
      })}
      {(result.messages?.length ?? 0) > 2 && (
        <p className="text-gray-400 text-[10px]">
          +{result.messages.length - 2} more message(s)
        </p>
      )}
    </Card>
  );
}

function CreatePromptResult({ result }: { result: any }) {
  return (
    <Card className="p-3 text-xs border-0 bg-transparent space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold">Created: {result.name}</span>
        <span className="text-gray-500 font-mono text-[10px]">
          v{result.version}
        </span>
      </div>
      <div className="text-gray-500 font-mono text-[10px]">
        ID: {result.prompt_id}
      </div>
      {result.variables?.length > 0 && (
        <div className="text-gray-600">
          Variables:{" "}
          {result.variables.map((v: string) => (
            <span
              key={v}
              className="inline-block bg-gray-100 px-1.5 py-0.5 mr-1 font-mono text-[10px]"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function EvaluatorsResult({ result }: { result: any }) {
  return (
    <Card className="p-3 text-xs border-0 bg-transparent">
      <div className="font-bold mb-2">
        Created {result.evaluators?.length} evaluator(s)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {result.evaluators?.map((e: any) => (
          <div
            key={e.slug}
            className="border border-gray-200 bg-white p-2 space-y-1"
          >
            <div className="font-bold text-[10px]">{e.name}</div>
            <div className="text-gray-500 font-mono text-[10px] truncate">
              {e.slug}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TestCasesResult({ result }: { result: any }) {
  const [expanded, setExpanded] = useState(false);
  const cases = result.test_cases ?? [];
  const shown = expanded ? cases : cases.slice(0, 3);

  return (
    <Card className="p-3 text-xs border-0 bg-transparent space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold">
          Generated {result.count} test case(s)
        </span>
        <span className="text-gray-500 font-mono text-[10px]">
          Dataset: {result.dataset_id?.slice(0, 8)}...
        </span>
      </div>
      <div className="space-y-1.5">
        {shown.map((tc: any, i: number) => (
          <div key={i} className="border border-gray-200 bg-white p-2">
            <div className="text-[10px] text-gray-500 mb-0.5">
              Input #{i + 1}
            </div>
            <div className="font-mono text-[10px] line-clamp-2">
              {typeof tc.input === "string"
                ? tc.input
                : JSON.stringify(tc.input)}
            </div>
          </div>
        ))}
      </div>
      {cases.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-gray-500 underline"
        >
          {expanded ? "Show less" : `Show all ${cases.length}`}
        </button>
      )}
    </Card>
  );
}

function ExperimentResult({ result }: { result: any }) {
  const scores = result.scores ?? {};
  const builtIn = result.built_in_metrics ?? {};

  const radarMetrics: RadarMetric[] = [
    ...Object.entries(scores).map(([slug, val]) => ({
      label: slug
        .replace(/-eval$/, "")
        .replace(/^optimizer-\s*/i, "")
        .replace(/-/g, " "),
      value: val as number,
      maxValue: 10,
    })),
  ];

  // Add built-in metrics (inverted: lower = better → higher radar score)
  if (builtIn.avg_cost != null && builtIn.avg_cost > 0) {
    // Normalize cost: $0 → 10, $0.01+ → lower
    const costScore = Math.max(0, 10 - builtIn.avg_cost * 1000);
    radarMetrics.push({
      label: "Cost",
      value: Math.min(10, costScore),
      maxValue: 10,
      isBuiltIn: true,
    });
  }
  if (builtIn.avg_latency != null && builtIn.avg_latency > 0) {
    // Normalize latency: 0s → 10, 10s+ → 0
    const latencyScore = Math.max(0, 10 - builtIn.avg_latency);
    radarMetrics.push({
      label: "Speed",
      value: Math.min(10, latencyScore),
      maxValue: 10,
      isBuiltIn: true,
    });
  }

  return (
    <Card className="p-3 text-xs border-0 bg-transparent space-y-3">
      <div className="font-bold">Experiment Results</div>

      {radarMetrics.length >= 3 && (
        <RadarChart metrics={radarMetrics} size={280} />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(scores).map(([slug, val]) => (
          <div key={slug} className="border border-gray-200 bg-white p-2">
            <div className="text-[10px] text-gray-500 truncate">
              {slug.replace(/-eval$/, "").replace(/^optimizer-\s*/i, "")}
            </div>
            <div className={`font-mono font-bold ${scoreColor(val as number)}`}>
              {(val as number).toFixed(1)}/10
            </div>
          </div>
        ))}
        {builtIn.avg_cost != null && (
          <div className="border border-gray-200 bg-white p-2">
            <div className="text-[10px] text-gray-500">Avg Cost *</div>
            <div className="font-mono font-bold">
              {formatCost(builtIn.avg_cost)}
            </div>
          </div>
        )}
        {builtIn.avg_latency != null && (
          <div className="border border-gray-200 bg-white p-2">
            <div className="text-[10px] text-gray-500">Avg Latency *</div>
            <div className="font-mono font-bold">
              {builtIn.avg_latency.toFixed(2)}s
            </div>
          </div>
        )}
      </div>
      <div className="text-[10px] text-gray-400">
        * Built-in metrics from log data
      </div>
    </Card>
  );
}

function ImprovedPromptResult({ result }: { result: any }) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <Card className="p-3 text-xs border-0 bg-transparent space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold">Improved Prompt</span>
        <span className="text-gray-500 font-mono text-[10px]">
          v{result.new_version} {result.deployed && "(deployed)"}
        </span>
      </div>
      {result.analysis && (
        <div className="border-l-2 border-gray-300 pl-2 text-gray-600">
          {result.analysis}
        </div>
      )}
      <button
        onClick={() => setShowPrompt(!showPrompt)}
        className="text-[10px] text-gray-500 underline"
      >
        {showPrompt ? "Hide prompt" : "Show new prompt"}
      </button>
      {showPrompt && result.new_messages && (
        <div className="space-y-1.5">
          {result.new_messages.map((m: any, i: number) => {
            const content =
              typeof m.content === "string"
                ? m.content
                : Array.isArray(m.content)
                  ? m.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("")
                  : m.content?.text ?? JSON.stringify(m.content);
            return (
              <div key={i} className="border border-gray-200 bg-white p-2">
                <span className="font-bold text-gray-500 text-[10px] uppercase">
                  {m.role}
                </span>
                <p className="text-gray-700 mt-0.5 whitespace-pre-wrap text-[10px] max-h-32 overflow-auto">
                  {content}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SummaryResult({ result }: { result: any }) {
  const improvements = result.improvements ?? {};
  const allIterations = result.all_iterations ?? [];

  // Build radar data for seed vs best
  const metricSlugs = Object.keys(improvements);
  const seedMetrics: RadarMetric[] = metricSlugs.map((slug) => ({
    label: improvements[slug].name,
    value: improvements[slug].from,
  }));
  const bestMetrics: RadarMetric[] = metricSlugs.map((slug) => ({
    label: improvements[slug].name,
    value: improvements[slug].to,
  }));

  return (
    <Card className="p-3 text-xs border-0 bg-transparent space-y-3">
      {/* Score banner */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
            Overall Improvement
          </div>
          <div className="font-mono font-bold text-base">
            <span className={scoreColor(result.seed_avg_score ?? 0)}>
              {(result.seed_avg_score ?? 0).toFixed(1)}
            </span>
            <span className="text-gray-400 mx-2">&rarr;</span>
            <span className={scoreColor(result.best_avg_score ?? 0)}>
              {(result.best_avg_score ?? 0).toFixed(1)}
            </span>
            {(result.best_avg_score ?? 0) > (result.seed_avg_score ?? 0) && (
              <span className="text-green-600 text-sm ml-2">
                (+
                {(
                  ((result.best_avg_score - result.seed_avg_score) /
                    Math.max(result.seed_avg_score, 0.1)) *
                  100
                ).toFixed(0)}
                %)
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-gray-500">
          Best: v{result.best_version}
        </div>
      </div>

      {/* Radar chart: seed (dashed) vs best (solid) */}
      {seedMetrics.length >= 3 && (
        <div>
          <div className="text-[10px] text-gray-500 mb-1">
            Seed (dashed) vs Best (solid)
          </div>
          <RadarChart
            metrics={bestMetrics}
            comparison={seedMetrics}
            size={280}
          />
        </div>
      )}

      {/* Per-metric improvements */}
      <div className="space-y-1">
        {Object.entries(improvements).map(([slug, imp]: [string, any]) => (
          <div
            key={slug}
            className="flex items-center justify-between border-b border-gray-100 py-1"
          >
            <span className="text-gray-600">{imp.name}</span>
            <span className="font-mono">
              <span className={scoreColor(imp.from)}>{imp.from.toFixed(1)}</span>
              <span className="text-gray-400 mx-1">&rarr;</span>
              <span className={scoreColor(imp.to)}>{imp.to.toFixed(1)}</span>
              {imp.change > 0 && (
                <span className="text-green-600 ml-1">
                  +{imp.change.toFixed(1)}
                </span>
              )}
              {imp.change < 0 && (
                <span className="text-red-600 ml-1">
                  {imp.change.toFixed(1)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Versions table */}
      {allIterations.length > 1 && (
        <div className="overflow-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-bold uppercase">
                <th className="text-left py-1 pr-2">Version</th>
                <th className="text-right py-1 pr-2">Avg Score</th>
                <th className="text-right py-1 pr-2">Cost</th>
                <th className="text-right py-1">Latency</th>
              </tr>
            </thead>
            <tbody>
              {allIterations.map((it: any) => {
                const vals = Object.values(it.scores) as number[];
                const avg =
                  vals.length > 0
                    ? vals.reduce((a: number, b: number) => a + b, 0) /
                      vals.length
                    : 0;
                return (
                  <tr key={it.version} className="border-b border-gray-50">
                    <td className="py-1 pr-2 font-mono">v{it.version}</td>
                    <td
                      className={`text-right py-1 pr-2 font-mono font-bold ${scoreColor(avg)}`}
                    >
                      {avg.toFixed(1)}
                    </td>
                    <td className="text-right py-1 pr-2 font-mono text-gray-600">
                      {formatCost(it.avg_cost)}
                    </td>
                    <td className="text-right py-1 font-mono text-gray-600">
                      {it.avg_latency?.toFixed(2)}s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.pareto_frontier && (
        <div className="text-[10px] text-gray-400">
          Pareto frontier versions: {result.pareto_frontier.join(", ")}
        </div>
      )}
    </Card>
  );
}

function ToolResultCard({
  toolName,
  result,
}: {
  toolName: string;
  result: any;
}) {
  switch (toolName) {
    case "fetch_prompt":
      return <FetchPromptResult result={result} />;
    case "create_prompt":
      return <CreatePromptResult result={result} />;
    case "create_evaluators":
      return <EvaluatorsResult result={result} />;
    case "generate_test_cases":
      return <TestCasesResult result={result} />;
    case "run_experiment":
      return <ExperimentResult result={result} />;
    case "improve_prompt":
      return <ImprovedPromptResult result={result} />;
    case "get_optimization_summary":
      return <SummaryResult result={result} />;
    default:
      return (
        <Card className="p-3 text-xs border-0 bg-transparent font-mono">
          <div className="font-bold mb-1">{toolName}</div>
          <pre className="overflow-auto max-h-32 text-[10px]">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      );
  }
}

function ToolLoadingCard({ toolName }: { toolName: string }) {
  const labels: Record<string, string> = {
    fetch_prompt: "Fetching prompt...",
    create_prompt: "Creating prompt...",
    generate_test_cases: "Generating test cases (this may take a moment)...",
    create_evaluators: "Creating evaluators...",
    run_experiment:
      "Running experiment (1-3 minutes)...",
    improve_prompt: "Analyzing and improving prompt...",
    get_optimization_summary: "Computing summary...",
  };

  return (
    <Card className="p-3 text-xs border-0 bg-transparent">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-gray-400 border-t-black rounded-full animate-spin" />
        <span className="text-gray-600">
          {labels[toolName] ?? `Running ${toolName}...`}
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Welcome message with starters
// ---------------------------------------------------------------------------

function WelcomeMessage({ onSelect }: { onSelect: (text: string) => void }) {
  const starters = [
    "I want to optimize an existing prompt",
    "Help me create and optimize a new prompt",
    "What can you help me with?",
  ];

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-lg font-bold">Prompt Optimization Agent</h2>
        <p className="text-xs text-gray-600">
          I'll help you systematically evaluate and improve your prompts using
          automated experiments and multi-metric scoring.
        </p>
        <div className="flex flex-col gap-2">
          {starters.map((text) => (
            <button
              key={text}
              onClick={() => onSelect(text)}
              className="border border-gray-200 bg-white px-4 py-2 text-xs hover:border-black transition-colors text-left"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PromptOptimizerSection(props: {
  respanApiKey: string;
}) {
  const { respanApiKey } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setInput,
    append,
    error,
  } = useChat({
    api: "/api/prompt-optimizer",
    headers: {
      ...(respanApiKey
        ? { "x-respan-api-key": respanApiKey }
        : {}),
    },
  });

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleStarterSelect = (text: string) => {
    append({ role: "user", content: text });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        handleSubmit(e as any);
      }
    }
  };

  return (
    <div className="mb-12 space-y-4">
      {/* Chat container */}
      <Card className="flex flex-col" style={{ height: 600 }}>
        {messages.length === 0 ? (
          <WelcomeMessage onSelect={handleStarterSelect} />
        ) : (
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto p-4 space-y-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] space-y-2 ${
                    message.role === "user"
                      ? "bg-black text-white px-3 py-2 text-xs"
                      : ""
                  }`}
                >
                  {message.parts?.map((part, i) => {
                    if (part.type === "text" && part.text) {
                      if (message.role === "user") {
                        return (
                          <div key={i} className="text-xs whitespace-pre-wrap">
                            {part.text}
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="text-xs text-gray-800 prose-sm">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1">{children}</h3>,
                              h2: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1">{children}</h3>,
                              h3: ({ children }) => <h4 className="text-xs font-bold mt-2 mb-1">{children}</h4>,
                              h4: ({ children }) => <h4 className="text-xs font-bold mt-2 mb-0.5">{children}</h4>,
                              p: ({ children }) => <p className="mb-1.5 leading-relaxed">{children}</p>,
                              strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                              code: ({ className, children, ...props }) => {
                                const isBlock = className?.includes("language-");
                                if (isBlock) {
                                  return (
                                    <pre className="bg-gray-100 border border-gray-200 p-2 my-1.5 overflow-x-auto text-[10px] font-mono">
                                      <code>{children}</code>
                                    </pre>
                                  );
                                }
                                return (
                                  <code className="bg-gray-100 px-1 py-0.5 text-[10px] font-mono" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              pre: ({ children }) => <>{children}</>,
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-1.5">
                                  <table className="w-full border-collapse text-[10px]">{children}</table>
                                </div>
                              ),
                              thead: ({ children }) => <thead className="border-b border-gray-300">{children}</thead>,
                              tbody: ({ children }) => <tbody>{children}</tbody>,
                              tr: ({ children }) => <tr className="border-b border-gray-100">{children}</tr>,
                              th: ({ children }) => <th className="text-left py-1 pr-3 font-bold text-gray-600">{children}</th>,
                              td: ({ children }) => <td className="py-1 pr-3">{children}</td>,
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-gray-300 pl-2 my-1.5 text-gray-600 italic">{children}</blockquote>
                              ),
                              hr: () => <hr className="border-gray-200 my-2" />,
                              a: ({ href, children }) => (
                                <a href={href} className="underline text-gray-700 hover:text-black" target="_blank" rel="noreferrer">{children}</a>
                              ),
                            }}
                          >
                            {part.text}
                          </ReactMarkdown>
                        </div>
                      );
                    }
                    if (part.type === "tool-invocation") {
                      const inv = part.toolInvocation;
                      if (
                        inv.state === "call" ||
                        inv.state === "partial-call"
                      ) {
                        return (
                          <div key={i} className="bg-gray-100 border border-gray-200 rounded-md">
                            <ToolLoadingCard
                              toolName={inv.toolName}
                            />
                          </div>
                        );
                      }
                      if (inv.state === "result") {
                        return (
                          <div key={i} className="bg-gray-100 border border-gray-200 rounded-md">
                            <ToolResultCard
                              toolName={inv.toolName}
                              result={inv.result}
                            />
                          </div>
                        );
                      }
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}

            {isLoading &&
              messages.length > 0 &&
              messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="text-xs text-gray-400 animate-pulse">
                    Thinking...
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 p-2 bg-red-50 border border-red-200 text-xs text-red-700">
            {error.message}
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-gray-200 p-3">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none border border-gray-200 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-black"
              disabled={isLoading}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={!input.trim() || isLoading}
            >
              Send
            </Button>
          </form>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400">
        <span>* = built-in metric (from log data, no evaluator)</span>
        <span>Radar chart: 0-10 scale, outer = better</span>
      </div>
    </div>
  );
}
