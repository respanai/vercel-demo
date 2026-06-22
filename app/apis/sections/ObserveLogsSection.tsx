"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ObserveLogsSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const demoCustomerIdentifier = "user_demo_123";
  const updateNote = "Updated from Respan demo.";

  const [logsStepLoading, setLogsStepLoading] = useState<"create" | "get" | "update" | "list" | "delete-user" | null>(null);
  const [logId, setLogId] = useState("");
  const [logOrganizationId, setLogOrganizationId] = useState("");
  const [logTimestamp, setLogTimestamp] = useState("");
  const [logsCreateResult, setLogsCreateResult] = useState<any>(null);
  const [logsGetResult, setLogsGetResult] = useState<any>(null);
  const [logsUpdateResult, setLogsUpdateResult] = useState<any>(null);
  const [logsListResult, setLogsListResult] = useState<any>(null);
  const [logsDeleteUserResult, setLogsDeleteUserResult] = useState<any>(null);

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
        const createdLog = (data as any)?.response || data;
        if (createdLog?.unique_id) setLogId(String(createdLog.unique_id));
        if (createdLog?.unique_organization_id || createdLog?.organization_id) {
          setLogOrganizationId(String(createdLog.unique_organization_id || createdLog.organization_id));
        }
        if (createdLog?.timestamp || createdLog?.start_time) {
          setLogTimestamp(String(createdLog.timestamp || createdLog.start_time));
        }
      } finally {
        setLogsStepLoading(null);
      }
    },
    get: async () => {
      const uniqueId = logId.trim();
      if (!uniqueId) return;
      setLogsStepLoading("get");
      setLogsGetResult(null);
      try {
        const data = await postProxy("/api/respan/logs/get", respanApiKey, { unique_id: uniqueId });
        setLogsGetResult(data);
        const retrievedLog = (data as any)?.response || data;
        if (retrievedLog?.unique_organization_id || retrievedLog?.organization_id) {
          setLogOrganizationId(String(retrievedLog.unique_organization_id || retrievedLog.organization_id));
        }
        if (retrievedLog?.timestamp || retrievedLog?.start_time) {
          setLogTimestamp(String(retrievedLog.timestamp || retrievedLog.start_time));
        }
      } finally {
        setLogsStepLoading(null);
      }
    },
    update: async () => {
      const uniqueId = logId.trim();
      if (!uniqueId) return;
      setLogsStepLoading("update");
      setLogsUpdateResult(null);
      try {
        const data = await postProxy("/api/respan/logs/update", respanApiKey, {
          unique_id: uniqueId,
          unique_organization_id: logOrganizationId,
          timestamp: logTimestamp,
          note: updateNote,
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
        const uniqueId = logId.trim();
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
          filters: uniqueId ? { unique_id: { operator: "", value: [uniqueId] } } : {},
        });
        setLogsListResult(data);
      } finally {
        setLogsStepLoading(null);
      }
    },
    deleteDemoUser: async () => {
      setLogsStepLoading("delete-user");
      setLogsDeleteUserResult(null);
      try {
        const data = await postProxy("/api/respan/users/delete", respanApiKey, {
          customer_identifier: demoCustomerIdentifier,
          environment: "prod",
        });
        setLogsDeleteUserResult(data);
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
            <span className="text-gray-400">step 3 annotation:</span> note + positive_feedback
          </Card>
        </div>
      </Card>

      <div className="mb-4">
        <Label className="mb-2 block">Derived IDs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <Label className="mb-2 block text-[10px] uppercase tracking-widest text-gray-400">
              unique_id
            </Label>
            <Input
              value={logId}
              onChange={(event) => setLogId(event.target.value)}
              placeholder="Paste or create a log unique_id"
              aria-label="Log unique ID"
            />
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">source:</span> respan-demo
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">unique_organization_id:</span> {logOrganizationId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">timestamp:</span> {logTimestamp || "—"}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
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
          disabled={logsStepLoading !== null || !logId.trim()}
        >
          2) Retrieve log
        </Button>
        <Button
          className="w-full py-3"
          onClick={logs.update}
          disabled={logsStepLoading !== null || !logId.trim()}
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button
          className="w-full py-3"
          onClick={logs.deleteDemoUser}
          disabled={logsStepLoading !== null}
        >
          5) Delete demo user
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="Step 1 response" value={logsCreateResult} emptyText={'Click "1) Create log"'} />
        <JsonBlock title="Step 2 response" value={logsGetResult} emptyText={'Click "2) Retrieve log"'} />
        <JsonBlock title="Step 3 response" value={logsUpdateResult} emptyText={'Click "3) Update log"'} />
        <JsonBlock title="Step 4 response" value={logsListResult} emptyText={'Click "4) List logs"'} />
        <JsonBlock title="Step 5 response" value={logsDeleteUserResult} emptyText={'Click "5) Delete demo user"'} />
      </div>
    </div>
  );
}
