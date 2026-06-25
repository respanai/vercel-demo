"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { buildFullEvaluatorWorkflowPayload, buildFullEvaluatorWorkflowTasks } from "../lib/evaluationWorkflowPayload";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

function pickId(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).length > 0) return String(value);
  }
  return undefined;
}

const listPayload = { page: 1, page_size: 10, sort_by: "-created_at" };

function buildCreatePayload() {
  return buildFullEvaluatorWorkflowPayload(
    "Demo Evaluator Workflow",
    "Full eval_only evaluator workflow draft created from /apis.",
    "demo_evaluator",
  );
}

function buildUpdatePayload(workflowId: string | null) {
  const stamp = new Date().toISOString();
  return {
    workflow_id: workflowId,
    name: `Demo Evaluator Workflow Draft Update (${stamp})`,
    description: "Updated eval_only evaluator workflow draft from /apis.",
    tasks: buildFullEvaluatorWorkflowTasks("demo_evaluator_updated"),
  };
}

const workflowRunPayload = {
  payload: {
    input: { question: "What is 2+2?" },
    output: "The answer is 4.",
    expected_output: "4",
    metadata: { source: "vercel-demo-evaluator-run" },
    metrics: { latency: 0, cost: 0 },
  },
  event_type: "eval_only",
};

export function EvaluateEvaluatorSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowVersionId, setWorkflowVersionId] = useState<string | null>(null);
  const [deployedVersion, setDeployedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState<"list" | "create" | "get" | "update" | "commit" | "deploy" | "run" | "delete" | null>(null);
  const [r1, setR1] = useState<any>(null);
  const [r2, setR2] = useState<any>(null);
  const [r3, setR3] = useState<any>(null);
  const [r4, setR4] = useState<any>(null);
  const [r5, setR5] = useState<any>(null);
  const [r6, setR6] = useState<any>(null);
  const [r7, setR7] = useState<any>(null);
  const [r8, setR8] = useState<any>(null);

  const actions = {
    list: async () => {
      setLoading("list");
      setR1(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/list", respanApiKey, listPayload);
        setR1(data);
        const first = (data as any)?.response?.results?.[0] || (data as any)?.response?.data?.[0];
        const familyId = pickId(first, ["workflow_id"]);
        const versionId = pickId(first, ["id"]);
        if (!workflowId && familyId) setWorkflowId(familyId);
        if (!workflowVersionId && versionId) setWorkflowVersionId(versionId);
      } finally {
        setLoading(null);
      }
    },
    create: async () => {
      setLoading("create");
      setR2(null);
      setDeployedVersion(null);
      try {
        const createPayload = buildCreatePayload();
        const created = await postProxy("/api/respan/evaluation-pipelines/create", respanApiKey, createPayload);
        const familyId = pickId((created as any)?.response, ["workflow_id"]);
        const draftVersionId = pickId((created as any)?.response, ["id"]);
        if (familyId) setWorkflowId(familyId);
        if (draftVersionId) setWorkflowVersionId(draftVersionId);
        setR2({
          create_request: createPayload,
          created_evaluator_workflow_draft: created,
        });
      } finally {
        setLoading(null);
      }
    },
    get: async () => {
      if (!workflowId) return;
      setLoading("get");
      setR3(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/get", respanApiKey, { workflow_id: workflowId });
        setR3(data);
      } finally {
        setLoading(null);
      }
    },
    update: async () => {
      if (!workflowId) return;
      setLoading("update");
      setR4(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/update", respanApiKey, buildUpdatePayload(workflowId));
        setR4(data);
        const versionId = pickId((data as any)?.response, ["id"]);
        if (versionId) setWorkflowVersionId(versionId);
      } finally {
        setLoading(null);
      }
    },
    commit: async () => {
      if (!workflowId) return;
      setLoading("commit");
      setR5(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/commit", respanApiKey, {
          workflow_id: workflowId,
          description: "Committed from Vercel demo API page.",
        });
        setR5(data);
        const versionId = pickId((data as any)?.response, ["id"]);
        if (versionId) setWorkflowVersionId(versionId);
      } finally {
        setLoading(null);
      }
    },
    deploy: async () => {
      if (!workflowId) return;
      setLoading("deploy");
      setR6(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/deploy", respanApiKey, { workflow_id: workflowId });
        setR6(data);
        const version = Number((data as any)?.response?.version ?? 0);
        if (version > 0) setDeployedVersion(version);
        const versionId = pickId((data as any)?.response, ["id"]);
        if (versionId) setWorkflowVersionId(versionId);
      } finally {
        setLoading(null);
      }
    },
    run: async () => {
      if (!workflowId) return;
      setLoading("run");
      setR8(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/run", respanApiKey, {
          workflow_id: workflowId,
          ...workflowRunPayload,
        });
        setR8(data);
      } finally {
        setLoading(null);
      }
    },
    delete: async () => {
      if (!workflowId) return;
      setLoading("delete");
      setR7(null);
      try {
        const data = await postProxy("/api/respan/evaluation-pipelines/delete", respanApiKey, { workflow_id: workflowId });
        setR7(data);
        setWorkflowId(null);
        setWorkflowVersionId(null);
        setDeployedVersion(null);
      } finally {
        setLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Evaluate - Evaluator</h2>
        <p className="text-xs text-gray-600 mt-1">
          Full evaluator workflows backed by eval_only WorkflowVersion families. No separate evaluator resource is created.
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">list payload:</span> {JSON.stringify(listPayload)}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">create full evaluator workflow draft:</span> {JSON.stringify(buildCreatePayload())}
          </Card>
          <Card className="p-3 text-xs font-mono md:col-span-2">
            <span className="text-gray-400">run workflow payload:</span> {JSON.stringify(workflowRunPayload)}
          </Card>
        </div>
      </Card>

      <div className="mb-4">
        <Label className="mb-2 block">Derived IDs</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">workflow_id:</span> {workflowId || "-"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">workflow_version_id:</span> {workflowVersionId || "-"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">deployed_version:</span> {deployedVersion || "-"}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button className="w-full py-3" onClick={actions.list} disabled={loading !== null}>1) List workflows</Button>
        <Button className="w-full py-3" onClick={actions.create} disabled={loading !== null}>2) Create workflow draft</Button>
        <Button className="w-full py-3" onClick={actions.get} disabled={loading !== null || !workflowId}>3) Retrieve workflow</Button>
        <Button className="w-full py-3" onClick={actions.update} disabled={loading !== null || !workflowId}>4) Update draft</Button>
        <Button className="w-full py-3" onClick={actions.commit} disabled={loading !== null || !workflowId}>5) Commit draft</Button>
        <Button className="w-full py-3" onClick={actions.deploy} disabled={loading !== null || !workflowId}>6) Deploy workflow</Button>
        <Button className="w-full py-3" onClick={actions.run} disabled={loading !== null || !workflowId}>7) Run workflow</Button>
        <Button className="w-full py-3" onClick={actions.delete} disabled={loading !== null || !workflowId}>8) Delete workflow</Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={r1} emptyText={'Click "1) List workflows"'} />
        <JsonBlock title="Step 2 response" value={r2} emptyText={'Click "2) Create workflow draft"'} />
        <JsonBlock title="Step 3 response" value={r3} emptyText={'Click "3) Retrieve workflow"'} />
        <JsonBlock title="Step 4 response" value={r4} emptyText={'Click "4) Update draft"'} />
        <JsonBlock title="Step 5 response" value={r5} emptyText={'Click "5) Commit draft"'} />
        <JsonBlock title="Step 6 response" value={r6} emptyText={'Click "6) Deploy workflow"'} />
        <JsonBlock title="Step 7 response" value={r8} emptyText={'Click "7) Run workflow"'} />
        <JsonBlock title="Step 8 response" value={r7} emptyText={'Click "8) Delete workflow"'} />
      </div>
    </div>
  );
}
