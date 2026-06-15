"use client";

import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SCENARIOS,
  SERVICES,
  TENANTS,
  getScenario,
  type ServiceKey,
  type Tenant,
} from "./config";

const TRACES_URL = "https://platform.respan.ai/platform/traces";

type StepStatus = "idle" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  summary?: string;
  tool?: string;
  toolResult?: Record<string, unknown>;
  promptSource?: "managed" | "inline";
  promptVersion?: number;
  tokens?: number;
  ms?: number;
}

interface LaneState {
  status: "idle" | "running" | "done" | "error";
  scenarioId: string;
  ticketId?: string;
  steps: Record<string, StepState>;
  totals?: { tokens: number; ms: number; services: number; promptsManaged: number };
  error?: string;
}

const ACCENT: Record<string, { border: string; chip: string; dot: string }> = {
  blue: { border: "border-blue-300", chip: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  emerald: { border: "border-emerald-300", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

function planFor(scenarioId: string): ServiceKey[] {
  const s = getScenario(scenarioId);
  const route = s?.route ?? "incident";
  return ["triage", route, "knowledge", "notification"];
}

function freshLane(scenarioId: string): LaneState {
  return { status: "idle", scenarioId, steps: {} };
}

const STATUS_STYLE: Record<StepStatus, string> = {
  idle: "text-gray-300",
  running: "text-amber-500",
  done: "text-emerald-600",
  error: "text-red-600",
};

const STATUS_GLYPH: Record<StepStatus, string> = {
  idle: "○",
  running: "◐",
  done: "●",
  error: "✕",
};

export function OpsConsole({ respanApiKey }: { respanApiKey: string }) {
  const [lanes, setLanes] = useState<Record<string, LaneState>>(() =>
    Object.fromEntries(TENANTS.map((t, i) => [t.id, freshLane(SCENARIOS[i % SCENARIOS.length].id)]))
  );
  const [ramp, setRamp] = useState<{ active: boolean; done: number; total: number; tokens: number }>({
    active: false,
    done: 0,
    total: 0,
    tokens: 0,
  });

  const anyRunning = useMemo(
    () => ramp.active || Object.values(lanes).some((l) => l.status === "running"),
    [lanes, ramp.active]
  );

  const updateLane = useCallback((tenantId: string, fn: (l: LaneState) => LaneState) => {
    setLanes((prev) => ({ ...prev, [tenantId]: fn(prev[tenantId]) }));
  }, []);

  const setScenario = (tenantId: string, scenarioId: string) =>
    updateLane(tenantId, () => freshLane(scenarioId));

  // Stream one ticket through the pipeline, updating the lane per event.
  const runTenant = useCallback(
    async (tenant: Tenant, scenarioId: string) => {
      const plan = planFor(scenarioId);
      updateLane(tenant.id, () => ({
        ...freshLane(scenarioId),
        status: "running",
        steps: Object.fromEntries(plan.map((k) => [k, { status: "idle" as StepStatus }])),
      }));

      try {
        const res = await fetch("/api/atomicworks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(respanApiKey ? { "x-respan-api-key": respanApiKey } : {}),
          },
          body: JSON.stringify({ tenantId: tenant.id, scenarioId }),
        });
        if (!res.ok || !res.body) {
          const msg = (await res.json().catch(() => null))?.error || `HTTP ${res.status}`;
          updateLane(tenant.id, (l) => ({ ...l, status: "error", error: msg }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line);
            if (ev.type === "ticket_start") {
              updateLane(tenant.id, (l) => ({ ...l, ticketId: ev.ticketId }));
            } else if (ev.type === "service_start") {
              updateLane(tenant.id, (l) => ({
                ...l,
                steps: { ...l.steps, [ev.service]: { ...l.steps[ev.service], status: "running", tool: ev.tool } },
              }));
            } else if (ev.type === "service_done") {
              updateLane(tenant.id, (l) => ({
                ...l,
                steps: {
                  ...l.steps,
                  [ev.service]: {
                    status: "done",
                    summary: ev.summary,
                    tool: ev.tool,
                    toolResult: ev.toolResult,
                    promptSource: ev.promptSource,
                    promptVersion: ev.promptVersion,
                    tokens: ev.tokens,
                    ms: ev.ms,
                  },
                },
              }));
            } else if (ev.type === "ticket_done") {
              updateLane(tenant.id, (l) => ({ ...l, status: "done", totals: ev.totals }));
            } else if (ev.type === "error") {
              updateLane(tenant.id, (l) => ({ ...l, status: "error", error: ev.message }));
            }
          }
        }
      } catch (err) {
        updateLane(tenant.id, (l) => ({ ...l, status: "error", error: err instanceof Error ? err.message : "stream failed" }));
      }
    },
    [respanApiKey, updateLane]
  );

  const fireBoth = useCallback(() => {
    TENANTS.forEach((t) => runTenant(t, lanes[t.id].scenarioId));
  }, [lanes, runTenant]);

  // Ramp: fire N concurrent runs across both tenants to populate volume in Respan.
  const runRamp = useCallback(
    async (n = 12) => {
      setRamp({ active: true, done: 0, total: n, tokens: 0 });
      const jobs = Array.from({ length: n }, (_, i) => {
        const tenant = TENANTS[i % TENANTS.length];
        const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
        return { tenant, scenarioId: scenario.id };
      });
      await Promise.all(
        jobs.map(async ({ tenant, scenarioId }) => {
          try {
            const res = await fetch("/api/atomicworks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(respanApiKey ? { "x-respan-api-key": respanApiKey } : {}),
              },
              body: JSON.stringify({ tenantId: tenant.id, scenarioId }),
            });
            if (res.body) {
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.trim()) continue;
                  const ev = JSON.parse(line);
                  if (ev.type === "ticket_done") {
                    setRamp((r) => ({ ...r, done: r.done + 1, tokens: r.tokens + (ev.totals?.tokens ?? 0) }));
                  }
                }
              }
            }
          } catch {
            setRamp((r) => ({ ...r, done: r.done + 1 }));
          }
        })
      );
      setRamp((r) => ({ ...r, active: false }));
    },
    [respanApiKey]
  );

  return (
    <div className="space-y-4">
      {/* Two tenant lanes side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TENANTS.map((tenant) => (
          <Lane key={tenant.id} tenant={tenant} lane={lanes[tenant.id]} onScenario={(s) => setScenario(tenant.id, s)} busy={anyRunning} />
        ))}
      </div>

      {/* Control bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={fireBoth} disabled={anyRunning}>
              ⚡ Fire both tenants
            </Button>
            <Button variant="default" onClick={() => runRamp(12)} disabled={anyRunning}>
              ↑ Ramp · 12 concurrent
            </Button>
          </div>
          <a className="text-xs font-mono underline underline-offset-4" href={TRACES_URL} target="_blank" rel="noreferrer">
            → View live in Respan
          </a>
        </div>
        {ramp.total > 0 && (
          <div className="mt-3 text-xs font-mono text-gray-600">
            ramp: {ramp.done}/{ramp.total} tickets · {ramp.tokens.toLocaleString()} tokens
            {!ramp.active && ramp.done === ramp.total && " · done — open Respan and filter by customer_identifier"}
          </div>
        )}
      </Card>
    </div>
  );
}

function Lane({
  tenant,
  lane,
  onScenario,
  busy,
}: {
  tenant: Tenant;
  lane: LaneState;
  onScenario: (scenarioId: string) => void;
  busy: boolean;
}) {
  const accent = ACCENT[tenant.accent] ?? ACCENT.blue;
  const plan = planFor(lane.scenarioId);

  return (
    <Card className={`p-0 overflow-hidden border ${accent.border}`}>
      {/* Lane header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{tenant.emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{tenant.displayName}</div>
            <div className="text-[10px] text-gray-500 truncate">
              {tenant.industry} · {tenant.model}
            </div>
          </div>
        </div>
        <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-mono ${accent.chip}`}>
          {tenant.customerIdentifier}
        </span>
      </div>

      {/* Scenario picker */}
      <div className="px-4 py-3 border-b border-gray-100">
        <label className="block text-[10px] font-mono text-gray-500 mb-1">scenario</label>
        <select
          className="w-full border border-gray-200 bg-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-black disabled:opacity-50"
          value={lane.scenarioId}
          onChange={(e) => onScenario(e.target.value)}
          disabled={busy}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Pipeline */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>ticket.resolve</span>
          <span>{lane.ticketId ?? (lane.status === "running" ? "…" : "—")}</span>
        </div>
        {plan.map((key) => {
          const svc = SERVICES.find((s) => s.key === key)!;
          const step = lane.steps[key] ?? { status: "idle" as StepStatus };
          return (
            <div key={key} className="rounded-sm">
              <div className="flex items-center gap-2 text-xs">
                <span className={`${STATUS_STYLE[step.status]} ${step.status === "running" ? "animate-pulse" : ""}`}>
                  {STATUS_GLYPH[step.status]}
                </span>
                <span className="font-mono font-semibold">{svc.label}</span>
                <span className="text-gray-400 text-[10px] truncate">{svc.blurb}</span>
                <span className="ml-auto flex items-center gap-2 text-[10px] font-mono text-gray-400">
                  {step.promptSource === "managed" && (
                    <span className="text-violet-600" title={`managed prompt v${step.promptVersion ?? "?"}`}>
                      prompt{step.promptVersion != null ? ` v${step.promptVersion}` : ""}
                    </span>
                  )}
                  {step.tokens != null && step.status === "done" && <span>{step.tokens}t</span>}
                  {step.ms != null && step.status === "done" && <span>{step.ms}ms</span>}
                </span>
              </div>
              {step.summary && (
                <div className="ml-5 mt-0.5 text-[11px] text-gray-600 leading-snug">{step.summary}</div>
              )}
              {step.toolResult && step.status === "done" && (
                <div className="ml-5 mt-0.5 text-[10px] font-mono text-gray-400 truncate">
                  ↳ {step.tool}() → {JSON.stringify(step.toolResult)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lane footer */}
      <div className="border-t border-gray-100 px-4 py-2 text-[10px] font-mono text-gray-500 min-h-[1.75rem]">
        {lane.status === "error" && <span className="text-red-600">error: {lane.error}</span>}
        {lane.status === "done" && lane.totals && (
          <span>
            {lane.totals.services} services · {lane.totals.tokens} tokens · {lane.totals.ms}ms
            {lane.totals.promptsManaged > 0 && ` · ${lane.totals.promptsManaged} managed prompts`}
          </span>
        )}
        {lane.status === "running" && <span className="text-amber-600">running…</span>}
        {lane.status === "idle" && <span>idle</span>}
      </div>
    </Card>
  );
}
