"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";

function pickFirst<T = any>(v: any, keys: string[]): T | undefined {
  if (!v || typeof v !== "object") return undefined;
  for (const k of keys) {
    const val = (v as any)[k];
    if (val !== undefined && val !== null) return val as T;
  }
  return undefined;
}

export function DevelopExperimentsV2Section(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  // Fixed inputs (no user entry)
  const experimentSearchFilters = { name: { operator: "startswith", value: "" } };

  const createExperimentTemplate = {
    name: "Demo Experiment (vercel-demo)",
    description: "Custom workflow (no LLM calls). Created from /apis.",
    workflows: [{ type: "custom", config: { allow_submission: true, timeout_hours: 24 } }],
    evaluator_slugs: [],
  };

  const createDatasetPayload = {
    name: "Demo Dataset for Experiments (vercel-demo)",
    description: "Created automatically from /apis → Develop → Experiments (v2).",
    is_empty: true,
  };

  const createDatasetLogPayload = {
    input: { messages: [{ role: "user", content: "Hello from dataset log (experiments v2 demo)." }] },
    output: { expected: "placeholder", note: "This dataset entry is for the custom workflow placeholder log." },
    metadata: { custom_identifier: "experiments-v2-dataset-log", model: "gpt-4o-mini" },
    metrics: { cost: 0.0, latency: 0.0 },
  };

  const updateLogOutput = {
    output: "This is the output of the custom workflow (updated_customer_user_demo123)",
  };

  // Derived IDs
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [createdExperimentId, setCreatedExperimentId] = useState<string | null>(null);
  const [experimentLogId, setExperimentLogId] = useState<string | null>(null);
  const [comparisonKey, setComparisonKey] = useState<string | null>(null);

  // Results
  const [r1, setR1] = useState<any>(null);
  const [r2, setR2] = useState<any>(null);
  const [r3, setR3] = useState<any>(null);
  const [r4, setR4] = useState<any>(null);
  const [r5, setR5] = useState<any>(null);
  const [r6, setR6] = useState<any>(null);
  const [r7, setR7] = useState<any>(null);
  const [r8, setR8] = useState<any>(null);

  const [loading, setLoading] = useState<
    | "create-dataset"
    | "create-dataset-log"
    | "list-experiments"
    | "search-experiments"
    | "get-experiment"
    | "create-experiment"
    | "delete-experiment"
    | "list-experiment-logs"
    | "search-experiment-logs"
    | "get-experiment-log"
    | "update-experiment-log"
    | "summary-experiment-logs"
    | "export-experiment-logs"
    | null
  >(null);

  const activeExperimentId = createdExperimentId || experimentId;

  const actions = {
    createDataset: async () => {
      setLoading("create-dataset");
      // re-use r1 for prep response panel (keeps UI compact)
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
    listExperiments: async () => {
      setLoading("list-experiments");
      setR1(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/list", respanApiKey, {});
        setR1(data);
        const first = (data as any)?.response?.results?.[0];
        const firstId = pickFirst(first, ["id", "experiment_id"]);
        if (firstId) setExperimentId(String(firstId));
        const ds = pickFirst(first, ["dataset_id"]);
        if (ds) setDatasetId(String(ds));
      } finally {
        setLoading(null);
      }
    },
    searchExperiments: async () => {
      setLoading("search-experiments");
      setR2(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/search", respanApiKey, {
          filters: experimentSearchFilters,
        });
        setR2(data);
        const first = (data as any)?.response?.results?.[0];
        const firstId = pickFirst(first, ["id", "experiment_id"]);
        if (firstId) setExperimentId(String(firstId));
        const ds = pickFirst(first, ["dataset_id"]);
        if (ds) setDatasetId(String(ds));
      } finally {
        setLoading(null);
      }
    },
    getExperiment: async () => {
      if (!experimentId) return;
      setLoading("get-experiment");
      setR3(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/get", respanApiKey, {
          experiment_id: experimentId,
        });
        setR3(data);
        const ds = pickFirst((data as any)?.response, ["dataset_id"]);
        if (ds) setDatasetId(String(ds));
      } finally {
        setLoading(null);
      }
    },
    createExperiment: async () => {
      if (!datasetId) return;
      setLoading("create-experiment");
      setR4(null);
      try {
        const payload = { ...createExperimentTemplate, dataset_id: datasetId };
        const data = await postProxy("/api/respan/experiments-v2/create", respanApiKey, payload);
        setR4(data);
        const id = pickFirst((data as any)?.response, ["id", "experiment_id"]);
        if (id) setCreatedExperimentId(String(id));
      } finally {
        setLoading(null);
      }
    },
    deleteExperiment: async () => {
      if (!createdExperimentId) return;
      setLoading("delete-experiment");
      setR5(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/delete", respanApiKey, {
          experiment_id: createdExperimentId,
        });
        setR5(data);
      } finally {
        setLoading(null);
      }
    },
    listExperimentLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("list-experiment-logs");
      setR6(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/logs/list", respanApiKey, {
          experiment_id: activeExperimentId,
        });
        setR6(data);
        const firstLogId = pickFirst((data as any)?.response?.results?.[0], ["id", "trace_unique_id"]);
        if (firstLogId) setExperimentLogId(String(firstLogId));
      } finally {
        setLoading(null);
      }
    },
    searchExperimentLogs: async () => {
      if (!activeExperimentId || !comparisonKey) return;
      setLoading("search-experiment-logs");
      setR7(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/logs/search", respanApiKey, {
          experiment_id: activeExperimentId,
          filters: { comparison_key: { operator: "in", value: [comparisonKey] } },
        });
        setR7(data);
      } finally {
        setLoading(null);
      }
    },
    getExperimentLog: async () => {
      if (!activeExperimentId || !experimentLogId) return;
      setLoading("get-experiment-log");
      setR8(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/logs/get", respanApiKey, {
          experiment_id: activeExperimentId,
          log_id: experimentLogId,
        });
        setR8(data);
        const ck = pickFirst((data as any)?.response, ["comparison_key"]);
        if (ck) setComparisonKey(String(ck));
      } finally {
        setLoading(null);
      }
    },
    updateExperimentLog: async () => {
      if (!activeExperimentId || !experimentLogId) return;
      setLoading("update-experiment-log");
      setR1(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/logs/update", respanApiKey, {
          experiment_id: activeExperimentId,
          log_id: experimentLogId,
          output: updateLogOutput,
        });
        setR1(data);
      } finally {
        setLoading(null);
      }
    },
    summaryExperimentLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("summary-experiment-logs");
      setR2(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/logs/summary", respanApiKey, {
          experiment_id: activeExperimentId,
        });
        setR2(data);
      } finally {
        setLoading(null);
      }
    },
    exportExperimentLogs: async () => {
      if (!activeExperimentId) return;
      setLoading("export-experiment-logs");
      setR3(null);
      try {
        const data = await postProxy("/api/respan/experiments-v2/logs/export", respanApiKey, {
          experiment_id: activeExperimentId,
        });
        setR3(data);
      } finally {
        setLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Develop → Experiments (v2)</h2>
        <p className="text-xs text-gray-600 mt-1">
          Mirrors the workflow docs: discover an experiment → inspect it → fetch its logs → optionally update a log →
          summary. No inputs; IDs are derived from API responses.
        </p>
      </div>

      <div className="mb-4 border border-gray-200 bg-gray-50 p-4">
        <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest font-mono mb-2">Fixed inputs</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">dataset payload:</span> {JSON.stringify(createDatasetPayload)}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">dataset log payload:</span> {JSON.stringify(createDatasetLogPayload)}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">experiment search filters:</span> {JSON.stringify(experimentSearchFilters)}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">log update payload:</span> {JSON.stringify({ output: updateLogOutput })}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">create experiment payload (template):</span>{" "}
            {JSON.stringify(createExperimentTemplate)}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest font-mono mb-2">Derived IDs</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">experiment_id:</span> {experimentId || "—"}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">dataset_id:</span> {datasetId || "—"}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">created_experiment_id:</span> {createdExperimentId || "—"}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono">
            <span className="text-gray-400">log_id:</span> {experimentLogId || "—"}
          </div>
          <div className="border border-gray-200 bg-white p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">comparison_key (from log):</span> {comparisonKey || "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.createDataset}
          disabled={loading !== null}
        >
          1) Create dataset
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.createDatasetLog}
          disabled={loading !== null || !datasetId}
        >
          2) Create dataset log
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.createExperiment}
          disabled={loading !== null || !datasetId}
        >
          3) Create experiment
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.listExperimentLogs}
          disabled={loading !== null || !activeExperimentId}
        >
          4) List experiment logs
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.deleteExperiment}
          disabled={loading !== null || !createdExperimentId}
        >
          5) Delete experiment
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.listExperimentLogs}
          disabled={loading !== null || !activeExperimentId}
        >
          6) List experiment logs
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.getExperimentLog}
          disabled={loading !== null || !activeExperimentId || !experimentLogId}
        >
          7) Retrieve experiment log
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.searchExperimentLogs}
          disabled={loading !== null || !activeExperimentId || !comparisonKey}
        >
          8) Search experiment logs
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="1) List experiments response" value={r1} emptyText="Click “1) List experiments”" />
        <JsonBlock title="2) Search experiments response" value={r2} emptyText="Click “2) Search experiments”" />
        <JsonBlock title="3) Retrieve experiment response" value={r3} emptyText="Click “3) Retrieve experiment”" />
        <JsonBlock title="4) Create experiment response" value={r4} emptyText="Click “4) Create experiment”" />
        <JsonBlock title="5) Delete experiment response" value={r5} emptyText="Click “5) Delete experiment”" />
        <JsonBlock title="6) List experiment logs response" value={r6} emptyText="Click “6) List experiment logs”" />
        <JsonBlock title="7) Retrieve experiment log response" value={r8} emptyText="Click “7) Retrieve experiment log”" />
        <JsonBlock title="8) Search experiment logs response" value={r7} emptyText="Click “8) Search experiment logs”" />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.updateExperimentLog}
          disabled={loading !== null || !activeExperimentId || !experimentLogId}
        >
          9) Update experiment log
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.summaryExperimentLogs}
          disabled={loading !== null || !activeExperimentId}
        >
          10) Logs summary
        </button>
        <button
          className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono hover:border-black disabled:opacity-50"
          onClick={actions.exportExperimentLogs}
          disabled={loading !== null || !activeExperimentId}
        >
          11) Export logs
        </button>
        <button className="w-full border border-gray-200 bg-white px-3 py-3 text-xs font-mono disabled:opacity-50" disabled>
          —
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="9) Update experiment log response" value={r1} emptyText="Click “9) Update experiment log”" />
        <JsonBlock title="10) Logs summary response" value={r2} emptyText="Click “10) Logs summary”" />
        <JsonBlock title="11) Export logs response" value={r3} emptyText="Click “11) Export logs”" />
      </div>
    </div>
  );
}


