"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function pickFirst(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null && String(v).length > 0) return String(v);
  }
  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickFirstLog(response: any): any | undefined {
  return response?.results?.[0] || response?.logs?.[0] || response?.data?.[0];
}

function hasDatasetLogs(response: any): boolean {
  const count = Number(response?.count ?? response?.total ?? 0);
  return count > 0 || Boolean(pickFirstLog(response));
}

export function DevelopExperimentsSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const experimentSearchFilters = {
    filters: { name: "Demo Experiment (vercel-demo)" },
    page: 1,
    page_size: 10,
  };

  const createExperimentTemplate = {
    name: "Demo Experiment (vercel-demo)",
    description: "Passthrough workflow. Created from /apis.",
    workflow: [{ type: "duplicate", config: { name: "passthrough" } }],
  };

  const demoEvaluatorTemplate = {
    type: "llm",
    score_value_type: "numerical",
    configurations: {
      evaluator_definition:
        "Evaluate whether the output is reasonable for the input.\n\nInput: {{input}}\nOutput: {{output}}\n\nReturn a score from 0 to 10.",
      scoring_rubric: "0=incorrect or unrelated, 5=partially correct, 10=fully correct",
      llm_engine: "gpt-4o-mini",
      min_score: 0,
      max_score: 10,
      model_options: { temperature: 0 },
    },
  };

  function buildDemoEvaluatorPayload() {
    return {
      name: `Experiment Demo Correctness (${new Date().toISOString()})`,
      ...demoEvaluatorTemplate,
    };
  }

  const createDatasetPayload = {
    name: "Demo Dataset for Experiments (vercel-demo)",
    description: "Created automatically from /apis → Develop → Experiments.",
    is_empty: true,
  };

  const createDatasetLogPayload = {
    input: { messages: [{ role: "user", content: "Hello from dataset log (experiments demo)." }] },
    output: { expected: "placeholder", note: "This dataset entry is for the custom workflow placeholder log." },
    metadata: { custom_identifier: "experiments-dataset-log", model: "gpt-4o-mini" },
    metrics: { cost: 0.0, latency: 0.0 },
  };

  const updateLogPayload = {
    note: "Experiment log checked from vercel-demo.",
    positive_feedback: true,
  };

  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [createdExperimentId, setCreatedExperimentId] = useState<string | null>(null);
  const [evaluatorSlug, setEvaluatorSlug] = useState<string | null>(null);
  const [datasetLogId, setDatasetLogId] = useState<string | null>(null);
  const [datasetLogReady, setDatasetLogReady] = useState(false);
  const [experimentLogId, setExperimentLogId] = useState<string | null>(null);
  const [comparisonKey, setComparisonKey] = useState<string | null>(null);

  const [loading, setLoading] = useState<
    | "create-dataset"
    | "create-dataset-log"
    | "create-evaluator"
    | "create-experiment"
    | "list-experiments"
    | "search-experiments"
    | "get-experiment"
    | "delete-experiment"
    | "delete-dataset"
    | "delete-evaluator"
    | "list-logs"
    | "get-log"
    | "update-log"
    | "search-logs"
    | "summary-logs"
    | "export-logs"
    | null
  >(null);

  const [r1, setR1] = useState<any>(null);
  const [r2, setR2] = useState<any>(null);
  const [r3, setR3] = useState<any>(null);
  const [r4, setR4] = useState<any>(null);
  const [r5, setR5] = useState<any>(null);
  const [r6, setR6] = useState<any>(null);
  const [r7, setR7] = useState<any>(null);
  const [r8, setR8] = useState<any>(null);
  const [r9, setR9] = useState<any>(null);
  const [r10, setR10] = useState<any>(null);
  const [r11, setR11] = useState<any>(null);
  const [r12, setR12] = useState<any>(null);
  const [r13, setR13] = useState<any>(null);
  const [r14, setR14] = useState<any>(null);

  const activeExperimentId = createdExperimentId || experimentId;

  const actions = {
    createDataset: async () => {
      setLoading("create-dataset");
      setR1(null);
      try {
        const data = await postProxy("/api/respan/datasets/create", respanApiKey, createDatasetPayload);
        setR1(data);
        const id = pickFirst((data as any)?.response, ["id", "dataset_id"]);
        if (id) setDatasetId(String(id));
        setDatasetLogId(null);
        setDatasetLogReady(false);
        setCreatedExperimentId(null);
        setExperimentLogId(null);
        setComparisonKey(null);
      } finally {
        setLoading(null);
      }
    },
    createDatasetLog: async () => {
      if (!datasetId) return;
      setLoading("create-dataset-log");
      setR2(null);
      setDatasetLogId(null);
      setDatasetLogReady(false);
      try {
        const createResponse = await postProxy("/api/respan/datasets/logs/create", respanApiKey, {
          dataset_id: datasetId,
          ...createDatasetLogPayload,
        });

        let listResponse: any = null;
        let firstLog: any = null;
        for (let attempt = 1; attempt <= 12; attempt++) {
          listResponse = await postProxy("/api/respan/datasets/logs/list", respanApiKey, {
            dataset_id: datasetId,
            page: 1,
            page_size: 10,
          });
          firstLog = pickFirstLog((listResponse as any)?.response);
          if (hasDatasetLogs((listResponse as any)?.response)) break;
          await sleep(1500);
        }

        const logId =
          pickFirst(firstLog, ["id", "unique_id", "log_id", "trace_unique_id"]) ||
          pickFirst((createResponse as any)?.response, ["unique_id", "id", "log_id"]);
        if (logId) setDatasetLogId(String(logId));
        setDatasetLogReady(Boolean(firstLog) || hasDatasetLogs((listResponse as any)?.response));
        setR2({ create_dataset_log: createResponse, wait_for_dataset_log: listResponse });
      } finally {
        setLoading(null);
      }
    },
    createEvaluator: async () => {
      setLoading("create-evaluator");
      setR3(null);
      try {
        const data = await postProxy("/api/respan/evaluators/create", respanApiKey, buildDemoEvaluatorPayload());
        setR3(data);
        const slug =
          pickFirst((data as any)?.response, ["evaluator_slug", "slug", "id"]) ||
          pickFirst(data, ["evaluator_slug", "slug", "id"]);
        if (slug) setEvaluatorSlug(String(slug));
      } finally {
        setLoading(null);
      }
    },
    createExperiment: async () => {
      if (!datasetId || !datasetLogReady || !evaluatorSlug) return;
      setLoading("create-experiment");
      setR12(null);
      try {
        const payload = {
          ...createExperimentTemplate,
          dataset_id: datasetId,
          evaluator_slugs: [evaluatorSlug],
        };
        const data = await postProxy("/api/respan/experiments/create", respanApiKey, payload);
        setR12({
          create_experiment: data,
          create_experiment_request: payload,
        });
        const id = pickFirst((data as any)?.response, ["id", "experiment_id"]);
        if (id) setCreatedExperimentId(String(id));
      } finally {
        setLoading(null);
      }
    },
    listExperiments: async () => {
      setLoading("list-experiments");
      setR4(null);
      try {
        const data = await postProxy("/api/respan/experiments/list", respanApiKey, {});
        setR4(data);
        const first = (data as any)?.response?.results?.[0]?.id;
        if (!experimentId && first) setExperimentId(String(first));
      } finally {
        setLoading(null);
      }
    },
    searchExperiments: async () => {
      setLoading("search-experiments");
      setR5(null);
      try {
        const data = await postProxy("/api/respan/experiments/search", respanApiKey, experimentSearchFilters);
        setR5(data);
        const first = (data as any)?.response?.results?.[0]?.id;
        if (first) setExperimentId(String(first));
      } finally {
        setLoading(null);
      }
    },
    getExperiment: async () => {
      if (!activeExperimentId) return;
      setLoading("get-experiment");
      setR6(null);
      try {
        const data = await postProxy("/api/respan/experiments/get", respanApiKey, { experiment_id: activeExperimentId });
        setR6(data);
      } finally {
        setLoading(null);
      }
    },
    deleteExperiment: async () => {
      if (!createdExperimentId) return;
      setLoading("delete-experiment");
      setR7(null);
      try {
        const data = await postProxy("/api/respan/experiments/delete", respanApiKey, { experiment_id: createdExperimentId });
        setR7(data);
        setCreatedExperimentId(null);
        setExperimentLogId(null);
        setComparisonKey(null);
      } finally {
        setLoading(null);
      }
    },
    deleteDataset: async () => {
      if (!datasetId) return;
      setLoading("delete-dataset");
      setR13(null);
      try {
        const data = await postProxy("/api/respan/datasets/delete", respanApiKey, { dataset_id: datasetId });
        setR13(data);
        setDatasetId(null);
        setDatasetLogId(null);
        setDatasetLogReady(false);
      } finally {
        setLoading(null);
      }
    },
    deleteEvaluator: async () => {
      if (!evaluatorSlug) return;
      setLoading("delete-evaluator");
      setR14(null);
      try {
        const data = await postProxy("/api/respan/evaluators/delete", respanApiKey, { evaluator_id: evaluatorSlug });
        setR14(data);
        setEvaluatorSlug(null);
      } finally {
        setLoading(null);
      }
    },
    listExperimentLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("list-logs");
      setR8(null);
      setExperimentLogId(null);
      setComparisonKey(null);
      try {
        let data: any = null;
        let firstLog: any = null;
        for (let attempt = 1; attempt <= 12; attempt++) {
          data = await postProxy("/api/respan/experiments/logs/list", respanApiKey, {
            experiment_id: activeExperimentId,
            page: 1,
            page_size: 10,
            filters: {},
          });
          firstLog = pickFirstLog((data as any)?.response);
          if (firstLog) break;
          await sleep(2500);
        }

        setR8(data);

        const firstLogId = pickFirst(firstLog, ["id", "trace_unique_id", "unique_id", "log_id"]);
        if (firstLogId) setExperimentLogId(String(firstLogId));

        const ck = pickFirst(firstLog, ["comparison_key"]) || pickFirst((data as any)?.response, ["comparison_key"]);
        if (ck) setComparisonKey(String(ck));
      } finally {
        setLoading(null);
      }
    },
    getExperimentLog: async () => {
      if (!activeExperimentId || !experimentLogId) return;
      setLoading("get-log");
      setR9(null);
      try {
        const data = await postProxy("/api/respan/experiments/logs/get", respanApiKey, {
          experiment_id: activeExperimentId,
          log_id: experimentLogId,
        });
        setR9(data);
      } finally {
        setLoading(null);
      }
    },
    updateExperimentLog: async () => {
      if (!activeExperimentId || !experimentLogId) return;
      setLoading("update-log");
      setR10(null);
      try {
        const data = await postProxy("/api/respan/experiments/logs/update", respanApiKey, {
          experiment_id: activeExperimentId,
          log_id: experimentLogId,
          ...updateLogPayload,
        });
        setR10(data);
      } finally {
        setLoading(null);
      }
    },
    searchLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("search-logs");
      setR11(null);
      try {
        const payload = {
          experiment_id: activeExperimentId,
          page: 1,
          page_size: 10,
          filters: comparisonKey ? { comparison_key: { operator: "in", value: [comparisonKey] } } : {},
        };
        const data = await postProxy("/api/respan/experiments/logs/search", respanApiKey, payload);
        setR11(data);
        const firstLog = pickFirstLog((data as any)?.response);
        const firstLogId = pickFirst(firstLog, ["id", "trace_unique_id", "unique_id", "log_id"]);
        if (firstLogId) setExperimentLogId(String(firstLogId));
        const ck = pickFirst(firstLog, ["comparison_key"]) || pickFirst((data as any)?.response, ["comparison_key"]);
        if (ck) setComparisonKey(String(ck));
      } finally {
        setLoading(null);
      }
    },
    summaryLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("summary-logs");
      setR11(null);
      try {
        const data = await postProxy("/api/respan/experiments/logs/summary", respanApiKey, {
          experiment_id: activeExperimentId,
        });
        setR11(data);
      } finally {
        setLoading(null);
      }
    },
    exportLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("export-logs");
      setR11(null);
      try {
        const data = await postProxy("/api/respan/experiments/logs/export", respanApiKey, {
          experiment_id: activeExperimentId,
          page: 1,
          page_size: 100,
        });
        setR11(data);
      } finally {
        setLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Develop → Experiments</h2>
        <p className="text-xs text-gray-600 mt-1">Guided flow using v2 endpoints, labeled as "Experiments" in the demo.</p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">dataset payload:</span> {JSON.stringify(createDatasetPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">dataset log payload:</span> {JSON.stringify(createDatasetLogPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">create experiment payload (template):</span> {JSON.stringify(createExperimentTemplate)}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">create evaluator payload:</span> {JSON.stringify(demoEvaluatorTemplate)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">experiment search filters:</span> {JSON.stringify(experimentSearchFilters)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">log update payload:</span> {JSON.stringify(updateLogPayload)}
          </Card>
        </div>
      </Card>

      <div className="mb-4">
        <Label className="mb-2 block">Derived IDs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">dataset_id:</span> {datasetId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">experiment_id (picked):</span> {experimentId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">created_experiment_id:</span> {createdExperimentId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">evaluator_slug:</span> {evaluatorSlug || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">dataset_log_id:</span> {datasetLogId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">dataset_log_ready:</span> {datasetLogReady ? "true" : "false"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">log_id:</span> {experimentLogId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">comparison_key:</span> {comparisonKey || "—"}
          </Card>
        </div>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.createDataset} disabled={loading !== null}>
          1) Create dataset
        </Button>
        <Button className="w-full py-3" onClick={actions.createDatasetLog} disabled={loading !== null || !datasetId}>
          2) Create dataset log
        </Button>
        <Button className="w-full py-3" onClick={actions.createEvaluator} disabled={loading !== null}>
          3) Create evaluator
        </Button>
        <Button className="w-full py-3" onClick={actions.createExperiment} disabled={loading !== null || !datasetId || !datasetLogReady || !evaluatorSlug}>
          4) Create experiment
        </Button>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.listExperimentLogs} disabled={loading !== null || !activeExperimentId}>
          5) List experiment logs
        </Button>
        <Button className="w-full py-3" onClick={actions.getExperimentLog} disabled={loading !== null || !activeExperimentId || !experimentLogId}>
          6) Retrieve log
        </Button>
        <Button className="w-full py-3" onClick={actions.updateExperimentLog} disabled={loading !== null || !activeExperimentId || !experimentLogId}>
          7) Update log
        </Button>
        <Button className="w-full py-3" onClick={actions.listExperiments} disabled={loading !== null}>
          8) List experiments
        </Button>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.searchExperiments} disabled={loading !== null}>
          9) Search experiments
        </Button>
        <Button className="w-full py-3" onClick={actions.getExperiment} disabled={loading !== null || !activeExperimentId}>
          10) Retrieve experiment
        </Button>
        <Button className="w-full py-3" onClick={actions.searchLogs} disabled={loading !== null || !activeExperimentId}>
          11) Search logs
        </Button>
        <Button className="w-full py-3" onClick={actions.summaryLogs} disabled={loading !== null || !activeExperimentId}>
          12) Logs summary
        </Button>
      </div>

      {/* Row 4 (cleanup) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button className="w-full py-3" onClick={actions.exportLogs} disabled={loading !== null || !activeExperimentId}>
          13) Logs export
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteExperiment} disabled={loading !== null || !createdExperimentId}>
          14) Delete experiment
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteDataset} disabled={loading !== null || !datasetId}>
          15) Delete dataset
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteEvaluator} disabled={loading !== null || !evaluatorSlug}>
          16) Delete evaluator
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={r1} emptyText={'Click "1) Create dataset"'} />
        <JsonBlock title="Step 2 response" value={r2} emptyText={'Click "2) Create dataset log"'} />
        <JsonBlock title="Step 3 response" value={r3} emptyText={'Click "3) Create evaluator"'} />
        <JsonBlock title="Step 4 response" value={r12} emptyText={'Click "4) Create experiment"'} />
        <JsonBlock title="Step 5 response" value={r8} emptyText={'Click "5) List experiment logs"'} />
        <JsonBlock title="Step 6 response" value={r9} emptyText={'Click "6) Retrieve log"'} />
        <JsonBlock title="Step 7 response" value={r10} emptyText={'Click "7) Update log"'} />
        <JsonBlock title="Step 8 response" value={r4} emptyText={'Click "8) List experiments"'} />
        <JsonBlock title="Step 9 response" value={r5} emptyText={'Click "9) Search experiments"'} />
        <JsonBlock title="Step 10 response" value={r6} emptyText={'Click "10) Retrieve experiment"'} />
        <JsonBlock title="Step 11-13 response" value={r11} emptyText={'Click "11) Search logs", "12) Logs summary", or "13) Logs export"'} />
        <JsonBlock title="Step 14 response" value={r7} emptyText={'Click "14) Delete experiment"'} />
        <JsonBlock title="Step 15 response" value={r13} emptyText={'Click "15) Delete dataset"'} />
        <JsonBlock title="Step 16 response" value={r14} emptyText={'Click "16) Delete evaluator"'} />
      </div>
    </div>
  );
}
