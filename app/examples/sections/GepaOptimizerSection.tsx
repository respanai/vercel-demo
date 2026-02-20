"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParetoEntry {
  versionNumber: number;
  promptText: string;
  scores: Record<number, number>;
  meanScore: number;
  avgCost: number;
}

interface ProgressEvent {
  type: "setup" | "generation" | "complete" | "error";
  step?: string;
  message?: string;
  gen?: number;
  total?: number;
  score?: number;
  cost?: number;
  promptText?: string;
  data?: unknown;
  bestVersion?: number;
  bestScore?: number;
  bestPrompt?: string;
  seedScore?: number;
  paretoFrontier?: ParetoEntry[];
  allCandidates?: ParetoEntry[];
  promptId?: string;
  datasetId?: string;
}

interface GepaResult {
  bestVersion: number;
  bestScore: number;
  bestPrompt: string;
  seedScore: number;
  paretoFrontier: ParetoEntry[];
  allCandidates: ParetoEntry[];
  promptId: string;
  datasetId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score < 5) return "text-red-600";
  if (score < 7) return "text-yellow-600";
  return "text-green-600";
}

function formatCost(avgCost: number): string {
  // Show cost per 1k calls for readability
  const per1k = avgCost * 1000;
  if (per1k < 0.01) return `$${(per1k * 100).toFixed(2)}c/1k`;
  return `$${per1k.toFixed(2)}/1k`;
}

// ---------------------------------------------------------------------------
// Pareto Frontier Plot — X: Cost, Y: Mean Score
// ---------------------------------------------------------------------------

function ParetoFrontierPlot({
  allCandidates,
  paretoFrontier,
}: {
  allCandidates: ParetoEntry[];
  paretoFrontier: ParetoEntry[];
}) {
  const W = 480;
  const H = 360;
  const PAD = { top: 24, right: 24, bottom: 52, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const frontierIds = new Set(paretoFrontier.map((e) => e.versionNumber));

  const points = allCandidates.map((c) => ({
    version: c.versionNumber,
    cost: c.avgCost,
    score: c.meanScore,
    onFrontier: frontierIds.has(c.versionNumber),
    promptText: c.promptText,
  }));

  // Dynamic axis ranges with padding
  const costs = points.map((p) => p.cost);
  const scores = points.map((p) => p.score);
  const costMin = 0;
  const costMax = Math.max(...costs) * 1.15 || 0.001;
  const scoreMin = Math.max(0, Math.min(...scores) - 1);
  const scoreMax = Math.min(10, Math.max(...scores) + 1);

  const toX = (cost: number) => PAD.left + ((cost - costMin) / (costMax - costMin)) * plotW;
  const toY = (score: number) => PAD.top + plotH - ((score - scoreMin) / (scoreMax - scoreMin)) * plotH;

  // Sort frontier by cost for the line
  const frontierPoints = points
    .filter((p) => p.onFrontier)
    .sort((a, b) => a.cost - b.cost);

  const frontierLinePath =
    frontierPoints.length >= 2
      ? frontierPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.cost).toFixed(1)} ${toY(p.score).toFixed(1)}`)
          .join(" ")
      : "";

  // Grid ticks
  const xTicks = 5;
  const yTicks = 5;
  const xStep = (costMax - costMin) / xTicks;
  const yStep = (scoreMax - scoreMin) / yTicks;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => costMin + i * xStep);
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => scoreMin + i * yStep);

  const [hoveredVersion, setHoveredVersion] = useState<number | null>(null);
  const hoveredPoint = hoveredVersion != null ? points.find((p) => p.version === hoveredVersion) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-[480px]"
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        {/* Grid */}
        {xTickVals.map((t, i) => (
          <g key={`xg-${i}`}>
            <line x1={toX(t)} y1={PAD.top} x2={toX(t)} y2={PAD.top + plotH} stroke="#e5e7eb" strokeWidth={1} />
            <text x={toX(t)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">
              ${(t * 1000).toFixed(1)}
            </text>
          </g>
        ))}
        {yTickVals.map((t, i) => (
          <g key={`yg-${i}`}>
            <line x1={PAD.left} y1={toY(t)} x2={PAD.left + plotW} y2={toY(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.left - 8} y={toY(t) + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
              {t.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={PAD.left + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize={11}
          fill="#6b7280"
          fontWeight="bold"
        >
          Cost ($/1k calls)
        </text>
        <text
          x={12}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize={11}
          fill="#6b7280"
          fontWeight="bold"
          transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
        >
          Mean Score
        </text>

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#d1d5db" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="#d1d5db" strokeWidth={1} />

        {/* Pareto frontier line */}
        {frontierLinePath && (
          <path d={frontierLinePath} fill="none" stroke="#000" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.5} />
        )}

        {/* Dominated points */}
        {points
          .filter((p) => !p.onFrontier)
          .map((p) => (
            <circle
              key={`dom-${p.version}`}
              cx={toX(p.cost)}
              cy={toY(p.score)}
              r={hoveredVersion === p.version ? 7 : 5}
              fill="#d1d5db"
              stroke="#9ca3af"
              strokeWidth={1}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredVersion(p.version)}
              onMouseLeave={() => setHoveredVersion(null)}
            />
          ))}

        {/* Frontier points */}
        {points
          .filter((p) => p.onFrontier)
          .map((p) => (
            <circle
              key={`front-${p.version}`}
              cx={toX(p.cost)}
              cy={toY(p.score)}
              r={hoveredVersion === p.version ? 8 : 6}
              fill="#000"
              stroke="#fff"
              strokeWidth={2}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredVersion(p.version)}
              onMouseLeave={() => setHoveredVersion(null)}
            />
          ))}

        {/* Version labels on frontier */}
        {frontierPoints.map((p) => (
          <text
            key={`label-${p.version}`}
            x={toX(p.cost)}
            y={toY(p.score) - 10}
            textAnchor="middle"
            fontSize={9}
            fill="#000"
            fontWeight="bold"
          >
            v{p.version}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredPoint && (
        <div className="absolute top-2 right-2 bg-white border border-gray-200 p-2 text-xs font-mono shadow-sm max-w-[220px]">
          <p className="font-bold">Version #{hoveredPoint.version}</p>
          <p>Score: {hoveredPoint.score.toFixed(1)}/10</p>
          <p>Cost: {formatCost(hoveredPoint.cost)}</p>
          <p className={hoveredPoint.onFrontier ? "text-black font-bold" : "text-gray-400"}>
            {hoveredPoint.onFrontier ? "On frontier" : "Dominated"}
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-black border border-white" /> Pareto frontier
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300 border border-gray-400" /> Dominated
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-black" /> Frontier line
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GepaOptimizerSection(props: { keywordsaiApiKey: string }) {
  const { keywordsaiApiKey } = props;

  const [promptId, setPromptId] = useState("");
  const [iterations, setIterations] = useState(5);
  const [taskModel, setTaskModel] = useState("gpt-4o-mini");
  const [reflectionModel, setReflectionModel] = useState("gpt-4o");
  const [numTestCases, setNumTestCases] = useState(6);

  const [running, setRunning] = useState(false);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<GepaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const canRun = promptId.trim() && !running;

  const runOptimization = async () => {
    setRunning(true);
    setProgressLog([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/gepa-optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(keywordsaiApiKey ? { "x-keywordsai-api-key": keywordsaiApiKey } : {}),
        },
        body: JSON.stringify({
          promptId,
          iterations,
          taskModel,
          reflectionModel,
          numTestCases,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr) as ProgressEvent;
            setProgressLog((prev) => [...prev, event]);

            if (event.type === "complete") {
              setResult({
                bestVersion: event.bestVersion!,
                bestScore: event.bestScore!,
                bestPrompt: event.bestPrompt!,
                seedScore: event.seedScore!,
                paretoFrontier: event.paretoFrontier!,
                allCandidates: event.allCandidates ?? event.paretoFrontier!,
                promptId: event.promptId!,
                datasetId: event.datasetId!,
              });
            } else if (event.type === "error") {
              setError(event.message ?? "Unknown error");
            }

            requestAnimationFrame(() => {
              logContainerRef.current?.scrollTo({
                top: logContainerRef.current.scrollHeight,
                behavior: "smooth",
              });
            });
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  };

  const copyBestPrompt = async () => {
    if (!result) return;
    const text = typeof result.bestPrompt === "string" ? result.bestPrompt : JSON.stringify(result.bestPrompt, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-12 space-y-8">
      {/* Configuration */}
      <div className="space-y-4">
        <Label className="text-sm font-bold">Configuration</Label>

        <Card variant="muted" className="p-4">
          <Label className="mb-2 block">Prompt ID</Label>
          <Input
            value={promptId}
            onChange={(e) => setPromptId(e.target.value)}
            placeholder="Enter an existing deployed prompt ID..."
            disabled={running}
          />
          <p className="text-[10px] text-gray-500 mt-1">
            The prompt must already be deployed. Task description and evaluation criteria will be auto-generated.
          </p>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card variant="muted" className="p-3">
            <Label className="mb-1 block text-[10px] text-gray-500">Iterations</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value) || 5)}
              disabled={running}
            />
          </Card>
          <Card variant="muted" className="p-3">
            <Label className="mb-1 block text-[10px] text-gray-500">Test Cases</Label>
            <Input
              type="number"
              min={2}
              max={20}
              value={numTestCases}
              onChange={(e) => setNumTestCases(Number(e.target.value) || 6)}
              disabled={running}
            />
          </Card>
          <Card variant="muted" className="p-3">
            <Label className="mb-1 block text-[10px] text-gray-500">Task Model</Label>
            <select
              className="w-full border border-gray-200 bg-white px-2 py-1.5 text-xs font-mono focus:outline-none"
              value={taskModel}
              onChange={(e) => setTaskModel(e.target.value)}
              disabled={running}
            >
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-sonnet-4-5-20250929">claude-sonnet-4.5</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
            </select>
          </Card>
          <Card variant="muted" className="p-3">
            <Label className="mb-1 block text-[10px] text-gray-500">Reflection Model</Label>
            <select
              className="w-full border border-gray-200 bg-white px-2 py-1.5 text-xs font-mono focus:outline-none"
              value={reflectionModel}
              onChange={(e) => setReflectionModel(e.target.value)}
              disabled={running}
            >
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-sonnet-4-5-20250929">claude-sonnet-4.5</option>
              <option value="claude-opus-4-6">claude-opus-4.6</option>
            </select>
          </Card>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={runOptimization}
          disabled={!canRun}
        >
          {running ? "Optimizing..." : "Run Optimization"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <span className="font-bold">Error: </span>
          {error}
        </Card>
      )}

      {/* Live Progress */}
      {progressLog.length > 0 && (
        <div>
          <Label className="mb-2 block text-sm font-bold">Progress</Label>
          <Card className="p-0">
            <div
              ref={logContainerRef}
              className="max-h-80 overflow-auto p-4 font-mono text-xs space-y-1"
            >
              {progressLog.map((event, i) => {
                if (event.type === "setup") {
                  return (
                    <div key={i} className="text-gray-600">
                      <span className="text-green-600 mr-1">&#10003;</span>
                      {event.message}
                    </div>
                  );
                }
                if (event.type === "generation") {
                  if (event.step === "start" || event.step === "done") {
                    return (
                      <div key={i} className="font-bold mt-2">
                        {event.step === "done" && event.score != null ? (
                          <>
                            Gen {event.gen}: score{" "}
                            <span className={scoreColor(event.score)}>
                              {event.score.toFixed(1)}
                            </span>
                            /10
                            {event.cost != null && (
                              <span className="text-gray-400 ml-2 font-normal">
                                ({formatCost(event.cost)})
                              </span>
                            )}
                          </>
                        ) : (
                          event.message
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="text-gray-500 pl-4">
                      {event.message}
                    </div>
                  );
                }
                if (event.type === "error") {
                  return (
                    <div key={i} className="text-red-600 font-bold">
                      Error: {event.message}
                    </div>
                  );
                }
                if (event.type === "complete") {
                  return (
                    <div key={i} className="text-green-700 font-bold mt-2">
                      Optimization complete!
                    </div>
                  );
                }
                return null;
              })}
              {running && (
                <div className="text-gray-400 animate-pulse mt-1">Working...</div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <Label className="block text-sm font-bold">Results</Label>

          {/* Score improvement */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Score Improvement</p>
                <p className="text-lg font-mono font-bold">
                  <span className={scoreColor(result.seedScore)}>{result.seedScore.toFixed(1)}</span>
                  <span className="text-gray-400 mx-2">&rarr;</span>
                  <span className={scoreColor(result.bestScore)}>{result.bestScore.toFixed(1)}</span>
                  {result.bestScore > result.seedScore && (
                    <span className="text-green-600 text-sm ml-2">
                      (+{((result.bestScore - result.seedScore) / Math.max(result.seedScore, 0.1) * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Best version: #{result.bestVersion}</p>
                <p>Prompt ID: <span className="font-mono">{result.promptId}</span></p>
              </div>
            </div>
          </Card>

          {/* Pareto Frontier Plot — Cost vs Score */}
          <Card className="p-4">
            <Label className="mb-1 block">Pareto Frontier</Label>
            <p className="text-[10px] text-gray-500 mb-3">
              Trade-off between inference cost (prompt + completion tokens) and quality score. Points on the frontier are not dominated by any other.
            </p>
            <ParetoFrontierPlot
              allCandidates={result.allCandidates}
              paretoFrontier={result.paretoFrontier}
            />
          </Card>

          {/* Best Prompt */}
          <div className="grid grid-cols-1 gap-4">
            <Card variant="muted" className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-500">Best Prompt</Label>
                <Button size="sm" onClick={copyBestPrompt}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <Card className="p-3 text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                {typeof result.bestPrompt === "string" ? result.bestPrompt : JSON.stringify(result.bestPrompt, null, 2)}
              </Card>
            </Card>
          </div>

          {/* All Versions Table */}
          <Card className="p-4">
            <Label className="mb-3 block">All Versions</Label>
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] font-bold uppercase text-gray-500">
                    <th className="text-left py-2 pr-4">Version</th>
                    <th className="text-left py-2 pr-4">Prompt (truncated)</th>
                    <th className="text-right py-2 pr-4">Score</th>
                    <th className="text-right py-2 pr-4">Cost</th>
                    <th className="text-center py-2 pr-4">Frontier</th>
                    <th className="text-right py-2">Per-test Scores</th>
                  </tr>
                </thead>
                <tbody>
                  {result.allCandidates
                    .sort((a, b) => b.meanScore - a.meanScore)
                    .map((entry) => {
                      const onFrontier = result.paretoFrontier.some(
                        (f) => f.versionNumber === entry.versionNumber
                      );
                      return (
                        <tr
                          key={entry.versionNumber}
                          className={`border-b border-gray-100 ${onFrontier ? "bg-gray-50" : ""}`}
                        >
                          <td className="py-2 pr-4 font-mono">#{entry.versionNumber}</td>
                          <td className="py-2 pr-4 max-w-[200px] truncate" title={typeof entry.promptText === "string" ? entry.promptText : JSON.stringify(entry.promptText)}>
                            {(typeof entry.promptText === "string" ? entry.promptText : JSON.stringify(entry.promptText)).slice(0, 80)}...
                          </td>
                          <td className={`text-right py-2 pr-4 font-mono font-bold ${scoreColor(entry.meanScore)}`}>
                            {entry.meanScore.toFixed(1)}
                          </td>
                          <td className="text-right py-2 pr-4 font-mono text-gray-600">
                            {formatCost(entry.avgCost)}
                          </td>
                          <td className="text-center py-2 pr-4">
                            {onFrontier ? (
                              <span className="text-black font-bold">&#9679;</span>
                            ) : (
                              <span className="text-gray-300">&#9675;</span>
                            )}
                          </td>
                          <td className="text-right py-2 font-mono">
                            {Object.entries(entry.scores)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([idx, score]) => (
                                <span key={idx} className={`inline-block mx-0.5 ${scoreColor(score)}`}>
                                  {score.toFixed(0)}
                                </span>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Resource links */}
          <Card variant="muted" className="p-4">
            <Label className="mb-2 block text-gray-500">Created Resources</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Prompt ID: </span>
                <span className="font-mono">{result.promptId}</span>
              </div>
              <div>
                <span className="text-gray-500">Dataset ID: </span>
                <span className="font-mono">{result.datasetId}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
