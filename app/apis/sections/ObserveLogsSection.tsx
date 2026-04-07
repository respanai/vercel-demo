"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function ObserveLogsSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const demoCustomerIdentifier = "user_demo_123";
  const updatedCustomer = "updated_customer_user_demo123";

  const [logsStepLoading, setLogsStepLoading] = useState<"create" | "get" | "update" | "list" | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [logsCreateResult, setLogsCreateResult] = useState<any>(null);
  const [logsGetResult, setLogsGetResult] = useState<any>(null);
  const [logsUpdateResult, setLogsUpdateResult] = useState<any>(null);
  const [logsListResult, setLogsListResult] = useState<any>(null);

  const logs = {
    create: async () => {
      setLogsStepLoading("create");
      setLogsCreateResult(null);
      setLogsGetResult(null);
      setLogsUpdateResult(null);
      try {
        const data = await postProxy("/api/respan/logs/create", respanApiKey, {
          customer_identifier: demoCustomerIdentifier,
        });
        setLogsCreateResult(data);
        if ((data as any)?.unique_id) setLogId(String((data as any).unique_id));
      } finally {
        setLogsStepLoading(null);
      }
    },
    get: async () => {
      if (!logId) return;
      setLogsStepLoading("get");
      setLogsGetResult(null);
      try {
        const data = await postProxy("/api/respan/logs/get", respanApiKey, { unique_id: logId });
        setLogsGetResult(data);
      } finally {
        setLogsStepLoading(null);
      }
    },
    update: async () => {
      if (!logId) return;
      setLogsStepLoading("update");
      setLogsUpdateResult(null);
      try {
        const data = await postProxy("/api/respan/logs/update", respanApiKey, {
          unique_id: logId,
          metadata: { demo: "respan-demo", updated: true, customer_identifier: updatedCustomer },
          note: updatedCustomer,
          positive_feedback: true,
        });
        setLogsUpdateResult(data);
      } finally {
        setLogsStepLoading(null);
      }
    },
    list: async () => {
      setLogsStepLoading("list");
      setLogsListResult(null);
      try {
        const now = new Date();
        const start = new Date(now.getTime() - 15 * 60 * 1000);
        const end = new Date(now.getTime() + 5 * 60 * 1000);
        const data = await postProxy("/api/respan/logs/list", respanApiKey, {
          page: 1,
          page_size: 20,
          sort_by: "-id",
          is_test: "false",
          all_envs: "false",
          fetch_filters: "false",
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          filters: logId ? { unique_id: { operator: "", value: [logId] } } : {},
        });
        setLogsListResult(data);
      } finally {
        setLogsStepLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Observe → Logs</h2>
        <p className="text-xs text-gray-600 mt-1">
          Click in order so you have a <span className="font-mono">unique_id</span>.
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">customer_identifier:</span> {demoCustomerIdentifier}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">step 3 note + metadata.customer_identifier:</span> {updatedCustomer}
          </Card>
        </div>
      </Card>

      <div className="mb-4">
        <Label className="mb-2 block">Derived IDs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">unique_id:</span> {logId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">source:</span> respan-demo
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button
          className="w-full py-3"
          onClick={logs.create}
          disabled={logsStepLoading !== null}
        >
          1) Create log
        </Button>
        <Button
          className="w-full py-3"
          onClick={logs.get}
          disabled={logsStepLoading !== null || !logId}
        >
          2) Retrieve log
        </Button>
        <Button
          className="w-full py-3"
          onClick={logs.update}
          disabled={logsStepLoading !== null || !logId}
        >
          3) Update log
        </Button>
        <Button
          className="w-full py-3"
          onClick={logs.list}
          disabled={logsStepLoading !== null}
        >
          4) List logs
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={logsCreateResult} emptyText={'Click "1) Create log"'} />
        <JsonBlock title="Step 2 response" value={logsGetResult} emptyText={'Click "2) Retrieve log"'} />
        <JsonBlock title="Step 3 response" value={logsUpdateResult} emptyText={'Click "3) Update log"'} />
        <JsonBlock title="Step 4 response" value={logsListResult} emptyText={'Click "4) List logs"'} />
      </div>
    </div>
  );
}
