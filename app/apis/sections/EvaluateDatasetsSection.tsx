"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { buildFullEvaluatorWorkflowPayload } from "../lib/evaluationWorkflowPayload";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function pickId(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null && String(v).length > 0) return String(v);
  }
  return undefined;
}

export function EvaluateDatasetsSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const createDatasetPayload = {
    name: "Demo Dataset (vercel-demo)",
    description: "Created from /apis → Evaluate → Datasets (fixed inputs).",
    is_empty: true,
  };

  const patchDatasetPayload = {
    name: "Demo Dataset (vercel-demo) — renamed",
    description: "Patched from /apis → Evaluate → Datasets.",
  };

  const createDatasetLogPayload = {
    input: { question: "What is 2+2?", context: { source: "demo" } },
    output: { answer: "4", explanation: "Because 2 + 2 = 4." },
    metadata: { model: "gpt-4o-mini", custom_identifier: "dataset-demo-log" },
    metrics: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0, latency: 0.0 },
  };

  const logsListFilterPayload = {
    filters: {
      "metadata.custom_identifier": "dataset-demo-log",
    },
    page: 1,
    page_size: 50,
  };

  const createDatasetWithLogsBasePayload = {
    name: "Demo Dataset with specified logs (vercel-demo)",
    description: "Creates a request-log first, then uses initial_log_filters.id in dataset creation.",
    type: "sampling",
    sampling: 100,
    start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  function buildDemoEvaluatorPayload() {
    return buildFullEvaluatorWorkflowPayload(
      "Dataset Demo Evaluator Workflow",
      "Full eval_only evaluator workflow created from /apis -> Evaluate -> Datasets.",
      "dataset_demo",
    );
  }

  const [loading, setLoading] = useState<
    | "create-dataset"
    | "create-log"
    | "list-datasets"
    | "get-dataset"
    | "patch-dataset"
    | "delete-dataset"
    | "list-logs"
    | "list-logs-filter"
    | "create-with-logs"
    | "eval-list"
    | "eval-create"
    | "delete-evaluator"
    | null
  >(null);

  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetLogUniqueId, setDatasetLogUniqueId] = useState<string | null>(null);
  const [requestLogUniqueId, setRequestLogUniqueId] = useState<string | null>(null);
  const [evaluatorWorkflowId, setEvaluatorWorkflowId] = useState<string | null>(null);
  const [evaluatorWorkflowVersionId, setEvaluatorWorkflowVersionId] = useState<string | null>(null);
  const [evalReportId, setEvalReportId] = useState<string | null>(null);

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

  const actions = {
    createDataset: async () => {
      setLoading("create-dataset");
      setR1(null);
      try {
        const data = await postProxy("/api/respan/datasets/create", respanApiKey, createDatasetPayload);
        setR1(data);
        const id = pickId((data as any)?.response, ["id", "dataset_id"]);
        if (id) setDatasetId(id);
      } finally {
        setLoading(null);
      }
    },
    createDatasetLog: async () => {
      if (!datasetId) return;
      setLoading("create-log");
      setR2(null);
      try {
        const data = await postProxy("/api/respan/datasets/logs/create", respanApiKey, {
          dataset_id: datasetId,
          ...createDatasetLogPayload,
        });
        setR2(data);
        const uid =
          pickId((data as any)?.response?.log_data, ["unique_id"]) ||
          pickId((data as any)?.response, ["unique_id"]) ||
          pickId((data as any)?.response?.log_data, ["id"]);
        if (uid) setDatasetLogUniqueId(uid);
      } finally {
        setLoading(null);
      }
    },
    listDatasets: async () => {
      setLoading("list-datasets");
      setR3(null);
      try {
        const data = await postProxy("/api/respan/datasets/list", respanApiKey, {});
        setR3(data);
        const first = (data as any)?.response?.results?.[0]?.id;
        if (!datasetId && first) setDatasetId(String(first));
      } finally {
        setLoading(null);
      }
    },
    getDataset: async () => {
      if (!datasetId) return;
      setLoading("get-dataset");
      setR4(null);
      try {
        const data = await postProxy("/api/respan/datasets/get", respanApiKey, { dataset_id: datasetId });
        setR4(data);
      } finally {
        setLoading(null);
      }
    },
    patchDataset: async () => {
      if (!datasetId) return;
      setLoading("patch-dataset");
      setR5(null);
      try {
        const data = await postProxy("/api/respan/datasets/patch", respanApiKey, {
          dataset_id: datasetId,
          ...patchDatasetPayload,
        });
        setR5(data);
      } finally {
        setLoading(null);
      }
    },
    deleteDataset: async () => {
      if (!datasetId) return;
      setLoading("delete-dataset");
      setR6(null);
      try {
        const data = await postProxy("/api/respan/datasets/delete", respanApiKey, { dataset_id: datasetId });
        setR6(data);
        setDatasetId(null);
        setDatasetLogUniqueId(null);
        setEvalReportId(null);
      } finally {
        setLoading(null);
      }
    },
    listDatasetLogs: async () => {
      if (!datasetId) return;
      setLoading("list-logs");
      setR7(null);
      try {
        const data = await postProxy("/api/respan/datasets/logs/list", respanApiKey, {
          dataset_id: datasetId,
          page: 1,
          page_size: 10,
        });
        setR7(data);
      } finally {
        setLoading(null);
      }
    },
    listDatasetLogsWithFilters: async () => {
      if (!datasetId) return;
      setLoading("list-logs-filter");
      setR8(null);
      try {
        const data = await postProxy("/api/respan/datasets/logs/list-filter", respanApiKey, {
          dataset_id: datasetId,
          ...logsListFilterPayload,
        });
        setR8(data);
      } finally {
        setLoading(null);
      }
    },
    createDatasetWithSpecifiedLogs: async () => {
      setLoading("create-with-logs");
      setR9(null);
      try {
        const createdLog = await postProxy("/api/respan/logs/create", respanApiKey, {
          customer_identifier: "dataset_demo_customer",
        });
        const requestUid =
          pickId((createdLog as any)?.response, ["unique_id"]) ||
          pickId((createdLog as any)?.response?.log_data, ["unique_id"]);
        if (requestUid) setRequestLogUniqueId(String(requestUid));

        const datasetPayload = {
          ...createDatasetWithLogsBasePayload,
          initial_log_filters: { id: { operator: "in", value: requestUid ? [requestUid] : [] } },
        };
        const createdDataset = await postProxy("/api/respan/datasets/create-with-logs", respanApiKey, datasetPayload);
        const id = pickId((createdDataset as any)?.response, ["id", "dataset_id"]);
        if (id) setDatasetId(String(id));

        setR9({ created_request_log: createdLog, created_dataset: createdDataset });
      } finally {
        setLoading(null);
      }
    },
    listEvalRuns: async () => {
      if (!datasetId) return;
      setLoading("eval-list");
      setR10(null);
      try {
        const data = await postProxy("/api/respan/datasets/eval-reports/list", respanApiKey, { dataset_id: datasetId });
        setR10(data);
        const first = (data as any)?.response?.results?.[0];
        const reportId = pickId(first, ["task_id", "id", "eval_report_id", "run_id"]);
        if (reportId) setEvalReportId(String(reportId));
        // Existing eval runs may reference evaluators that this demo did not create, so cleanup only uses Step 11's evaluator.
      } finally {
        setLoading(null);
      }
    },
    runEvalOnDataset: async () => {
      setLoading("eval-create");
      setR11(null);
      try {
        const created = await postProxy("/api/respan/evaluation-pipelines/create", respanApiKey, buildDemoEvaluatorPayload());
        const workflowId = pickId((created as any)?.response, ["workflow_id"]);
        const draftVersionId = pickId((created as any)?.response, ["id"]);
        if (!workflowId) {
          setR11({ created_evaluation_pipeline: created, skipped_commit: "Evaluation pipeline creation did not return workflow_id." });
          return;
        }
        const committed = await postProxy("/api/respan/evaluation-pipelines/commit", respanApiKey, {
          workflow_id: workflowId,
          description: "Committed from Vercel demo datasets flow.",
        });
        const committedVersionId = pickId((committed as any)?.response, ["id"]) || draftVersionId;
        const deployed = await postProxy("/api/respan/evaluation-pipelines/deploy", respanApiKey, { workflow_id: workflowId });
        const deployedVersionId = pickId((deployed as any)?.response, ["id"]) || committedVersionId;
        setEvaluatorWorkflowId(String(workflowId));
        if (deployedVersionId) setEvaluatorWorkflowVersionId(String(deployedVersionId));
        setR11({
          created_evaluation_pipeline: created,
          committed_evaluation_pipeline: committed,
          deployed_evaluation_pipeline: deployed,
          note: "Dataset eval-report creation is not called here because that endpoint does not accept evaluation pipeline version IDs.",
        });
      } finally {
        setLoading(null);
      }
    },
    deleteEvaluator: async () => {
      if (!evaluatorWorkflowId) return;
      setLoading("delete-evaluator");
      setR12(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/delete", respanApiKey, {
          workflow_id: evaluatorWorkflowId,
        });
        setR12(data);
        setEvaluatorWorkflowId(null);
        setEvaluatorWorkflowVersionId(null);
      } finally {
        setLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Evaluate → Datasets</h2>
        <p className="text-xs text-gray-600 mt-1">
          Minimum setup for Experiments (v2): create an empty dataset, add 1 dataset log, and list/logs.
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">create dataset:</span> {JSON.stringify(createDatasetPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">patch dataset:</span> {JSON.stringify(patchDatasetPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">create dataset log:</span> {JSON.stringify(createDatasetLogPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">list logs (filters):</span> {JSON.stringify(logsListFilterPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">create dataset with specified logs:</span>{" "}
            {JSON.stringify(createDatasetWithLogsBasePayload)}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">step 10 evaluation pipeline:</span> {JSON.stringify(buildDemoEvaluatorPayload())}
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
            <span className="text-gray-400">dataset_log_unique_id:</span> {datasetLogUniqueId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">request_log_unique_id (for create-with-logs):</span> {requestLogUniqueId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">evaluator_workflow_id:</span> {evaluatorWorkflowId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">evaluator_workflow_version_id:</span> {evaluatorWorkflowVersionId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">eval_report_id:</span> {evalReportId || "—"}
          </Card>
        </div>
      </div>

      {/* 9 dataset APIs (fixed) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.createDataset} disabled={loading !== null}>
          1) Create dataset
        </Button>
        <Button className="w-full py-3" onClick={actions.createDatasetLog} disabled={loading !== null || !datasetId}>
          2) Create dataset log
        </Button>
        <Button className="w-full py-3" onClick={actions.listDatasets} disabled={loading !== null}>
          3) List datasets
        </Button>
        <Button className="w-full py-3" onClick={actions.getDataset} disabled={loading !== null || !datasetId}>
          4) Retrieve dataset
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.patchDataset} disabled={loading !== null || !datasetId}>
          5) Update dataset (PATCH)
        </Button>
        <Button className="w-full py-3" onClick={actions.listDatasetLogs} disabled={loading !== null || !datasetId}>
          6) List dataset logs (GET)
        </Button>
        <Button className="w-full py-3" onClick={actions.listDatasetLogsWithFilters} disabled={loading !== null || !datasetId}>
          7) List logs (filters)
        </Button>
        <Button className="w-full py-3" onClick={actions.createDatasetWithSpecifiedLogs} disabled={loading !== null}>
          8) Create dataset w/ specified logs
        </Button>
      </div>

      {/* 2 dataset eval APIs (fixed) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button className="w-full py-3" onClick={actions.listEvalRuns} disabled={loading !== null || !datasetId}>
          9) List eval runs
        </Button>
        <Button className="w-full py-3" onClick={actions.runEvalOnDataset} disabled={loading !== null}>
          10) Create evaluator
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteEvaluator} disabled={loading !== null || !evaluatorWorkflowId}>
          11) Delete evaluator
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteDataset} disabled={loading !== null || !datasetId}>
          12) Delete dataset
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={r1} emptyText={'Click "1) Create dataset"'} />
        <JsonBlock title="Step 2 response" value={r2} emptyText={'Click "2) Create dataset log"'} />
        <JsonBlock title="Step 3 response" value={r3} emptyText={'Click "3) List datasets"'} />
        <JsonBlock title="Step 4 response" value={r4} emptyText={'Click "4) Retrieve dataset"'} />
        <JsonBlock title="Step 5 response" value={r5} emptyText={'Click "5) Update dataset (PATCH)"'} />
        <JsonBlock title="Step 6 response" value={r7} emptyText={'Click "6) List dataset logs (GET)"'} />
        <JsonBlock title="Step 7 response" value={r8} emptyText={'Click "7) List logs (filters)"'} />
        <JsonBlock title="Step 8 response" value={r9} emptyText={'Click "8) Create dataset w/ specified logs"'} />
        <JsonBlock title="Step 9 response" value={r10} emptyText={'Click "9) List eval runs"'} />
        <JsonBlock title="Step 10 response" value={r11} emptyText={'Click "10) Create evaluator"'} />
        <JsonBlock title="Step 11 response" value={r12} emptyText={'Click "11) Delete evaluator"'} />
        <JsonBlock title="Step 12 response" value={r6} emptyText={'Click "12) Delete dataset"'} />
      </div>
    </div>
  );
}
