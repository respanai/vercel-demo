"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ============================================================================
// TYPES
// ============================================================================

interface Lead {
  email: string;
  name: string;
  company: string;
  role: string;
  websiteVisits: number;
  pagesViewed: string[];
  linkedinActivity: string;
  message?: string;
}

interface StepLog {
  step: number;
  name: string;
  status: "completed" | "skipped";
  result: Record<string, unknown>;
}

interface PipelineResponse {
  lead: Lead;
  steps: StepLog[];
  earlyExit: boolean;
  earlyExitReason?: string;
  summary?: {
    emailType: string;
    companySize: string;
    industry: string;
    icpScore: number;
    icpTier: string;
    intentScore: number;
    urgency: string;
    routingDecision: string;
    emailSubject: string;
  };
  metadata: {
    workflow: string;
    traceGroup: string;
  };
  error?: string;
}

interface QueuedLead {
  id: string;
  lead: Lead;
  status: "pending" | "processing" | "completed" | "error";
  result?: PipelineResponse;
  error?: string;
}

// ============================================================================
// SAMPLE LEADS (presets)
// ============================================================================

const PRESETS: { label: string; lead: Lead }[] = [
  {
    label: "High-value SDR",
    lead: {
      email: "sarah.chen@rocketcrm.io",
      name: "Sarah Chen",
      company: "RocketCRM",
      role: "VP of Sales",
      websiteVisits: 7,
      pagesViewed: [
        "/pricing",
        "/pricing",
        "/pricing",
        "/product/orchestration",
        "/case-studies/outreach-success",
        "/integrations/salesforce",
        "/demo",
      ],
      linkedinActivity:
        "Recently posted about evaluating new sales engagement tools. Commented on a thread about CRM fatigue and the need for better pipeline visibility. Shared an article about AI-powered SDR tools.",
      message:
        "Hi, I saw your demo at SaaStr and I'm interested in learning how Warmly could help our SDR team prioritize inbound leads. Can we set up a call this week?",
    },
  },
  {
    label: "Nurture lead",
    lead: {
      email: "mark@buildstuff.co",
      name: "Mark Rodriguez",
      company: "BuildStuff",
      role: "Founder & CEO",
      websiteVisits: 2,
      pagesViewed: ["/", "/blog/what-is-warm-outbound"],
      linkedinActivity:
        "Posts about web development projects and JavaScript frameworks. No mentions of sales tools or GTM strategy.",
    },
  },
  {
    label: "Generic email",
    lead: {
      email: "info@randomcorp.com",
      name: "Unknown",
      company: "RandomCorp",
      role: "Unknown",
      websiteVisits: 1,
      pagesViewed: ["/"],
      linkedinActivity: "",
    },
  },
];

const EMPTY_LEAD: Lead = {
  email: "",
  name: "",
  company: "",
  role: "",
  websiteVisits: 0,
  pagesViewed: [],
  linkedinActivity: "",
  message: "",
};

// ============================================================================
// STEP RENDERING
// ============================================================================

const STEP_ICONS: Record<number, string> = {
  1: "✉️",
  2: "🏢",
  3: "📊",
  4: "🔥",
  5: "✍️",
};

const ROUTING_STYLES: Record<string, { label: string; className: string }> = {
  route_to_sdr: {
    label: "ROUTE TO SDR",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  enroll_in_nurture: {
    label: "ENROLL IN NURTURE",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  disqualify: {
    label: "DISQUALIFY",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

const ROUTING_BADGE_STYLES: Record<string, string> = {
  route_to_sdr: "bg-green-100 text-green-700",
  enroll_in_nurture: "bg-blue-100 text-blue-700",
  disqualify: "bg-red-100 text-red-700",
};

function RoutingBadge({ decision }: { decision: string }) {
  const style = ROUTING_STYLES[decision];
  const badgeStyle = ROUTING_BADGE_STYLES[decision] || "bg-gray-100 text-gray-700";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 ${badgeStyle}`}>
      {style?.label || decision}
    </span>
  );
}

function StatusBadge({ status }: { status: QueuedLead["status"] }) {
  const styles: Record<QueuedLead["status"], string> = {
    pending: "bg-gray-100 text-gray-600",
    processing: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 ${styles[status]}`}>
      {status}
    </span>
  );
}

function StepCard({ stepLog }: { stepLog: StepLog }) {
  const icon = STEP_ICONS[stepLog.step] || "⚙️";
  const result = stepLog.result;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold bg-black text-white px-2 py-0.5">
          STEP {stepLog.step}
        </span>
        <span className="text-xs font-bold">
          {icon} {stepLog.name}
        </span>
        <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 ml-auto">
          {stepLog.status}
        </span>
      </div>

      {stepLog.step === 1 && (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs">
            <span>
              Type: <span className="font-bold font-mono">{result.type as string}</span>
            </span>
            <span>
              Confidence: <span className="font-bold">{((result.confidence as number) * 100).toFixed(0)}%</span>
            </span>
            <span>
              Continue: <span className="font-bold">{result.shouldContinue ? "Yes" : "No"}</span>
            </span>
          </div>
          <p className="text-[10px] text-gray-600">{result.reasoning as string}</p>
        </div>
      )}

      {stepLog.step === 2 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            Size: <span className="font-bold">{result.estimatedSize as string}</span>
          </div>
          <div>
            Industry: <span className="font-bold">{result.industry as string}</span>
          </div>
          <div>
            Funding: <span className="font-bold">{result.fundingStage as string}</span>
          </div>
          <div>
            HQ: <span className="font-bold">{result.headquarters as string}</span>
          </div>
          <div className="col-span-2">
            Tech: <span className="font-mono text-[10px]">{(result.likelyTechStack as string[])?.join(", ")}</span>
          </div>
        </div>
      )}

      {stepLog.step === 3 && (
        <div className="space-y-2">
          <div className="flex gap-4 text-xs">
            <span>
              Score: <span className="font-bold text-lg">{result.icpScore as number}</span>/100
            </span>
            <span>
              Tier:{" "}
              <span className="font-bold text-lg">{result.tier as string}</span>
            </span>
            <span>
              Recommended: <span className="font-bold">{result.recommended ? "Yes" : "No"}</span>
            </span>
          </div>
          {(result.fitReasons as string[])?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Fit reasons:</p>
              <div className="flex flex-wrap gap-1">
                {(result.fitReasons as string[]).map((r, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(result.antiReasons as string[])?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Anti-fit reasons:</p>
              <div className="flex flex-wrap gap-1">
                {(result.antiReasons as string[]).map((r, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stepLog.step === 4 && (
        <div className="space-y-2">
          <div className="flex gap-4 text-xs">
            <span>
              Intent: <span className="font-bold text-lg">{result.intentScore as number}</span>/100
            </span>
            <span>
              Stage: <span className="font-bold">{result.buyingStage as string}</span>
            </span>
            <span>
              Urgency: <span className="font-bold">{result.urgency as string}</span>
            </span>
          </div>
          {(result.hotSignals as string[])?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(result.hotSignals as string[]).map((s, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {stepLog.step === 5 && (
        <div className="space-y-3">
          <div className="flex gap-4 text-xs">
            <span>
              Routing:{" "}
              <span className="font-bold font-mono">{result.routingDecision as string}</span>
            </span>
            <span>
              Follow-up: <span className="font-bold">{result.suggestedFollowUpDays as number} days</span>
            </span>
          </div>
          <p className="text-[10px] text-gray-600">{result.reasoning as string}</p>
          <Card variant="muted" className="p-3">
            <p className="text-[10px] font-bold mb-1">Subject: {result.emailSubject as string}</p>
            <p className="text-[10px] whitespace-pre-wrap">{result.emailBody as string}</p>
          </Card>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WarmlyLeadQualificationSection(props: {
  keywordsaiApiKey: string;
}) {
  const { keywordsaiApiKey } = props;

  // Form state
  const [form, setForm] = useState<Lead>({ ...EMPTY_LEAD });
  const [pagesViewedText, setPagesViewedText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Queue state
  const [queue, setQueue] = useState<QueuedLead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const updateForm = useCallback((field: keyof Lead, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const fillPreset = useCallback((lead: Lead) => {
    setForm({ ...lead });
    setPagesViewedText(lead.pagesViewed.join(", "));
  }, []);

  const generateRandomLead = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/warmly-lead-qualification/generate-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(keywordsaiApiKey && {
            "x-keywordsai-api-key": keywordsaiApiKey,
          }),
        },
      });
      const data = await res.json();
      if (data.error) {
        setGenerateError(data.error);
        return;
      }
      setForm({
        name: data.name || "",
        email: data.email || "",
        company: data.company || "",
        role: data.role || "",
        websiteVisits: data.websiteVisits || 0,
        pagesViewed: data.pagesViewed || [],
        linkedinActivity: data.linkedinActivity || "",
        message: data.message || "",
      });
      setPagesViewedText(
        Array.isArray(data.pagesViewed) ? data.pagesViewed.join(", ") : ""
      );
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate lead");
    } finally {
      setGenerating(false);
    }
  }, [keywordsaiApiKey]);

  const buildLeadFromForm = useCallback((): Lead => {
    return {
      ...form,
      pagesViewed: pagesViewedText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }, [form, pagesViewedText]);

  const addToQueue = useCallback((): string => {
    const lead = buildLeadFromForm();
    const id = crypto.randomUUID();
    const item: QueuedLead = { id, lead, status: "pending" };
    setQueue((prev) => [...prev, item]);
    setSelectedId(id);
    // Reset form
    setForm({ ...EMPTY_LEAD });
    setPagesViewedText("");
    return id;
  }, [buildLeadFromForm]);

  const removeFromQueue = useCallback(
    (id: string) => {
      setQueue((prev) => prev.filter((q) => q.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  const fetchPipeline = useCallback(
    async (id: string, lead: Lead) => {
      setQueue((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: "processing" as const } : q))
      );

      try {
        const res = await fetch("/api/warmly-lead-qualification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(keywordsaiApiKey && {
              "x-keywordsai-api-key": keywordsaiApiKey,
            }),
          },
          body: JSON.stringify({ lead }),
        });

        const data = await res.json();
        if (data.error) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === id ? { ...q, status: "error" as const, error: data.error } : q
            )
          );
        } else {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === id ? { ...q, status: "completed" as const, result: data } : q
            )
          );
        }
      } catch (e) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === id
              ? {
                  ...q,
                  status: "error" as const,
                  error: e instanceof Error ? e.message : "Request failed",
                }
              : q
          )
        );
      }
    },
    [keywordsaiApiKey]
  );

  const runPipeline = useCallback(
    (id: string) => {
      const item = queue.find((q) => q.id === id);
      if (!item) return;
      fetchPipeline(id, item.lead);
    },
    [queue, fetchPipeline]
  );

  const addAndQualify = useCallback(() => {
    const lead = buildLeadFromForm();
    const id = crypto.randomUUID();
    setQueue((prev) => [...prev, { id, lead, status: "processing" as const }]);
    setSelectedId(id);
    setForm({ ...EMPTY_LEAD });
    setPagesViewedText("");
    fetchPipeline(id, lead);
  }, [buildLeadFromForm, fetchPipeline]);

  const qualifyAllPending = useCallback(async () => {
    const pending = queue.filter((q) => q.status === "pending");
    for (const item of pending) {
      await fetchPipeline(item.id, item.lead);
    }
  }, [queue, fetchPipeline]);

  const isFormValid = form.name.trim() && form.email.trim() && form.company.trim();
  const anyProcessing = queue.some((q) => q.status === "processing");
  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const selectedItem = queue.find((q) => q.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold">
          Lead Qualification Pipeline (5 Steps)
        </h2>
        <p className="text-xs text-gray-600 mt-1">
          Enter a lead below or try a preset, then add to your queue and qualify.
          Each step is a separate LLM call traced to Keywords AI.
        </p>
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-[10px] text-gray-500 self-center mr-1">Try:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="text-[10px] font-mono px-3 py-1 border border-gray-200 hover:border-black transition-colors"
            onClick={() => fillPreset(preset.lead)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Lead Form */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs font-bold">Lead Details</Label>
          <Button
            variant="default"
            size="sm"
            disabled={generating}
            onClick={generateRandomLead}
          >
            {generating ? "Generating..." : "Generate Random Lead"}
          </Button>
        </div>
        {generateError && (
          <p className="text-[10px] text-red-600 mb-3">{generateError}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-gray-500 mb-1 block">Name *</Label>
            <Input
              placeholder="Sarah Chen"
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 mb-1 block">Email *</Label>
            <Input
              placeholder="sarah@company.com"
              value={form.email}
              onChange={(e) => updateForm("email", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 mb-1 block">Company *</Label>
            <Input
              placeholder="RocketCRM"
              value={form.company}
              onChange={(e) => updateForm("company", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 mb-1 block">Role</Label>
            <Input
              placeholder="VP of Sales"
              value={form.role}
              onChange={(e) => updateForm("role", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 mb-1 block">Website Visits</Label>
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={form.websiteVisits || ""}
              onChange={(e) => updateForm("websiteVisits", parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500 mb-1 block">Pages Viewed (comma-separated)</Label>
            <Input
              placeholder="/pricing, /demo, /case-studies"
              value={pagesViewedText}
              onChange={(e) => setPagesViewedText(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-[10px] text-gray-500 mb-1 block">LinkedIn Activity</Label>
            <Textarea
              placeholder="Recent LinkedIn posts, comments, or shares..."
              rows={2}
              value={form.linkedinActivity}
              onChange={(e) => updateForm("linkedinActivity", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-[10px] text-gray-500 mb-1 block">Inbound Message (optional)</Label>
            <Textarea
              placeholder="Any message the lead sent..."
              rows={2}
              value={form.message || ""}
              onChange={(e) => updateForm("message", e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            variant="primary"
            className="flex-1"
            disabled={!isFormValid || anyProcessing}
            onClick={addAndQualify}
          >
            {anyProcessing ? "Processing..." : "Add to Queue & Qualify"}
          </Button>
          <Button
            variant="default"
            disabled={!isFormValid}
            onClick={addToQueue}
          >
            Add to Queue
          </Button>
        </div>
      </Card>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold">
              Lead Queue ({queue.length})
            </Label>
            {pendingCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                disabled={anyProcessing}
                onClick={qualifyAllPending}
              >
                Qualify All Pending ({pendingCount})
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 border transition-all cursor-pointer ${
                  selectedId === item.id
                    ? "border-2 border-black bg-gray-50"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate">{item.lead.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono truncate">
                      {item.lead.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-500">{item.lead.company}</span>
                    {item.status === "completed" && item.result?.summary && (
                      <>
                        <RoutingBadge decision={item.result.summary.routingDecision} />
                        <span className="text-[10px] text-gray-500">
                          ICP: {item.result.summary.icpTier}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          Intent: {item.result.summary.intentScore}
                        </span>
                      </>
                    )}
                    {item.status === "completed" && item.result?.earlyExit && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700">
                        EARLY EXIT
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={item.status} />
                  {item.status === "pending" && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={anyProcessing}
                      onClick={(e) => {
                        e.stopPropagation();
                        runPipeline(item.id);
                      }}
                    >
                      Run
                    </Button>
                  )}
                  <button
                    className="text-[10px] text-gray-400 hover:text-red-500 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromQueue(item.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results for Selected Lead */}
      {queue.length > 0 && (
        <div className="space-y-4">
          <Label className="text-xs font-bold block">Results</Label>

          {!selectedItem && (
            <Card variant="muted" className="p-6 text-center">
              <p className="text-xs text-gray-500">
                Select a lead from the queue to view results
              </p>
            </Card>
          )}

          {selectedItem?.status === "processing" && (
            <Card variant="muted" className="p-6 text-center">
              <p className="text-xs text-gray-500">
                Running pipeline for {selectedItem.lead.name}... (5 LLM calls)
              </p>
            </Card>
          )}

          {selectedItem?.status === "pending" && (
            <Card variant="muted" className="p-6 text-center">
              <p className="text-xs text-gray-500">
                Lead is pending — click Run or Qualify All to process
              </p>
            </Card>
          )}

          {selectedItem?.status === "error" && (
            <Card className="border-red-200 bg-red-50 p-4">
              <p className="text-xs text-red-700 font-mono">{selectedItem.error}</p>
            </Card>
          )}

          {selectedItem?.status === "completed" && selectedItem.result && (
            <div className="space-y-4">
              {/* Summary Card */}
              {selectedItem.result.earlyExit ? (
                <Card className="border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⛔</span>
                    <span className="text-xs font-bold text-amber-700">
                      Early Exit
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    {selectedItem.result.earlyExitReason}
                  </p>
                </Card>
              ) : (
                selectedItem.result.summary && (
                  <Card
                    className={`p-4 border-2 ${
                      ROUTING_STYLES[selectedItem.result.summary.routingDecision]
                        ?.className || ""
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-bold">
                        {selectedItem.result.summary.routingDecision ===
                        "route_to_sdr"
                          ? "✅"
                          : selectedItem.result.summary.routingDecision ===
                              "enroll_in_nurture"
                            ? "📬"
                            : "❌"}{" "}
                        {
                          ROUTING_STYLES[
                            selectedItem.result.summary.routingDecision
                          ]?.label
                        }
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span>
                        ICP: {selectedItem.result.summary.icpScore}/100 (
                        {selectedItem.result.summary.icpTier})
                      </span>
                      <span>
                        Intent: {selectedItem.result.summary.intentScore}/100
                      </span>
                      <span>
                        Urgency: {selectedItem.result.summary.urgency}
                      </span>
                    </div>
                  </Card>
                )
              )}

              {/* Step-by-step Results */}
              <div>
                <Label className="mb-3 block">
                  Pipeline Steps ({selectedItem.result.steps.length}/5 completed)
                </Label>
                <div className="space-y-4">
                  {selectedItem.result.steps.map((stepLog) => (
                    <StepCard key={stepLog.step} stepLog={stepLog} />
                  ))}
                </div>
              </div>

              {/* Trace Confirmation */}
              <Card className="p-4 border-green-200 bg-green-50">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 text-lg">✓</span>
                  <span className="text-xs font-bold text-green-700">
                    All steps traced to Keywords AI
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-[10px] text-green-600">
                  <span>
                    Trace Group:{" "}
                    <span className="font-mono">
                      {selectedItem.result.metadata.traceGroup}
                    </span>
                  </span>
                  <span>
                    Steps logged:{" "}
                    <span className="font-mono">
                      {selectedItem.result.steps.length}
                    </span>
                  </span>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
