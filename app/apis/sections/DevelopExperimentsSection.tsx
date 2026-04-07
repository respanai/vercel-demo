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

export function DevelopExperimentsSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const experimentSearchFilters = {
    filters: { name: "Demo Experiment (vercel-demo)" },
    page: 1,
    page_size: 10,
  };

  const createExperimentTemplate = {
    name: "Demo Experiment (vercel-demo)",
    description: "Custom workflow (no LLM calls). Created from /apis.",
    workflows: [{ type: "custom", config: { allow_submission: true, timeout_hours: 24 } }],
    evaluator_slugs: [],
  };

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

  const updateLogOutput = {
    output: "This is the output of the custom workflow (updated_customer_user_demo123)",
  };

  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [createdExperimentId, setCreatedExperimentId] = useState<string | null>(null);
  const [experimentLogId, setExperimentLogId] = useState<string | null>(null);
  const [comparisonKey, setComparisonKey] = useState<string | null>(null);

  const [loading, setLoading] = useState<
    | "create-dataset"
    | "create-dataset-log"
    | "create-experiment"
    | "list-experiments"
    | "search-experiments"
    | "get-experiment"
    | "delete-experiment"
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
      } finally {
        setLoading(null);
      }
    },
    createDatasetLog: async () => {
      if (!datasetId) return;
      setLoading("create-dataset-log");
      setR2(null);
      try {
        const data = await postProxy("/api/respan/datasets/logs/create", respanApiKey, {
          dataset_id: datasetId,
          ...createDatasetLogPayload,
        });
        setR2(data);
      } finally {
        setLoading(null);
      }
    },
    createExperiment: async () => {
      if (!datasetId) return;
      setLoading("create-experiment");
      setR3(null);
      try {
        const payload = { ...createExperimentTemplate, dataset_id: datasetId };
        const data = await postProxy("/api/respan/experiments/create", respanApiKey, payload);
        setR3(data);
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
      if (!activeExperimentId) return;
      setLoading("delete-experiment");
      setR7(null);
      try {
        const data = await postProxy("/api/respan/experiments/delete", respanApiKey, { experiment_id: activeExperimentId });
        setR7(data);
      } finally {
        setLoading(null);
      }
    },
    listExperimentLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("list-logs");
      setR8(null);
      try {
        const data = await postProxy("/api/respan/experiments/logs/list", respanApiKey, {
          experiment_id: activeExperimentId,
          page: 1,
          page_size: 10,
          filters: {},
        });
        setR8(data);

        const firstLog = (data as any)?.response?.results?.[0]?.id || (data as any)?.response?.logs?.[0]?.id;
        if (firstLog) setExperimentLogId(String(firstLog));

        const ck = (data as any)?.response?.comparison_key;
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
          output: updateLogOutput,
        });
        setR10(data);
      } finally {
        setLoading(null);
      }
    },
    searchLogs: async () => {
      setLoading("search-logs");
      setR11(null);
      try {
        const payload = {
          search: "Demo Experiment",
          page: 1,
          page_size: 10,
          filters: {},
        };
        const data = await postProxy("/api/respan/experiments/logs/search", respanApiKey, payload);
        setR11(data);
        const ck = (data as any)?.response?.comparison_key;
        if (ck) setComparisonKey(String(ck));
      } finally {
        setLoading(null);
      }
    },
    summaryLogs: async () => {
      setLoading("summary-logs");
      setR11(null);
      try {
        const payload = {
          comparison_key: comparisonKey,
        };
        const data = await postProxy("/api/respan/experiments/logs/summary", respanApiKey, payload);
        setR11(data);
      } finally {
        setLoading(null);
      }
    },
    exportLogs: async () => {
      setLoading("export-logs");
      setR11(null);
      try {
        const payload = {
          comparison_key: comparisonKey,
        };
        const data = await postProxy("/api/respan/experiments/logs/export", respanApiKey, payload);
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
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">experiment search filters:</span> {JSON.stringify(experimentSearchFilters)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">log update payload:</span> {JSON.stringify({ output: updateLogOutput })}
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
        <Button className="w-full py-3" onClick={actions.createExperiment} disabled={loading !== null || !datasetId}>
          3) Create experiment
        </Button>
        <Button className="w-full py-3" onClick={actions.listExperimentLogs} disabled={loading !== null || !activeExperimentId}>
          4) List experiment logs
        </Button>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.getExperimentLog} disabled={loading !== null || !activeExperimentId || !experimentLogId}>
          5) Retrieve log
        </Button>
        <Button className="w-full py-3" onClick={actions.updateExperimentLog} disabled={loading !== null || !activeExperimentId || !experimentLogId}>
          6) Update log
        </Button>
        <Button className="w-full py-3" onClick={actions.listExperiments} disabled={loading !== null}>
          7) List experiments
        </Button>
        <Button className="w-full py-3" onClick={actions.searchExperiments} disabled={loading !== null}>
          8) Search experiments
        </Button>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.getExperiment} disabled={loading !== null || !activeExperimentId}>
          9) Retrieve experiment
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteExperiment} disabled={loading !== null || !activeExperimentId}>
          10) Delete experiment
        </Button>
        <Button className="w-full py-3" onClick={actions.searchLogs} disabled={loading !== null}>
          11) Search logs
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
      </div>

      {/* Row 4 (comparison_key actions) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button className="w-full py-3" onClick={actions.summaryLogs} disabled={loading !== null || !comparisonKey}>
          12) Logs summary
        </Button>
        <Button className="w-full py-3" onClick={actions.exportLogs} disabled={loading !== null || !comparisonKey}>
          13) Logs export
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={r1} emptyText={'Click "1) Create dataset"'} />
        <JsonBlock title="Step 2 response" value={r2} emptyText={'Click "2) Create dataset log"'} />
        <JsonBlock title="Step 3 response" value={r3} emptyText={'Click "3) Create experiment"'} />
        <JsonBlock title="Step 4 response" value={r8} emptyText={'Click "4) List experiment logs"'} />
        <JsonBlock title="Step 5 response" value={r9} emptyText={'Click "5) Retrieve log"'} />
        <JsonBlock title="Step 6 response" value={r10} emptyText={'Click "6) Update log"'} />
        <JsonBlock title="Step 7 response" value={r4} emptyText={'Click "7) List experiments"'} />
        <JsonBlock title="Step 8 response" value={r5} emptyText={'Click "8) Search experiments"'} />
        <JsonBlock title="Step 9 response" value={r6} emptyText={'Click "9) Retrieve experiment"'} />
        <JsonBlock title="Step 10 response" value={r7} emptyText={'Click "10) Delete experiment"'} />
        <JsonBlock title="Step 11-13 response" value={r11} emptyText={'Click "11) Search logs", "12) Logs summary", or "13) Logs export"'} />
      </div>
    </div>
  );
}
