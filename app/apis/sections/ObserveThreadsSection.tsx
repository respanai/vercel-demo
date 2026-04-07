"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function ObserveThreadsSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const demoThreadIdentifier = "thread_demo_123";
  const demoCustomerIdentifier = "customer_thread_demo_123";

  const [threadsLoading, setThreadsLoading] = useState<"create" | "list" | null>(null);
  const [createLogResult, setCreateLogResult] = useState<any>(null);
  const [threadsResult, setThreadsResult] = useState<any>(null);

  const createLogWithThread = async () => {
    setThreadsLoading("create");
    setCreateLogResult(null);
    try {
      const data = await postProxy("/api/respan/logs/create", respanApiKey, {
        customer_identifier: demoCustomerIdentifier,
        thread_identifier: demoThreadIdentifier,
      });
      setCreateLogResult(data);
    } finally {
      setThreadsLoading(null);
    }
  };

  const listThreads = async () => {
    setThreadsLoading("list");
    setThreadsResult(null);
    try {
      const data = await postProxy("/api/respan/threads/list", respanApiKey, {
        page: 1,
        page_size: 50,
        filters: {
          thread_identifier: { operator: "in", value: [demoThreadIdentifier] },
        },
      });
      setThreadsResult(data);
    } finally {
      setThreadsLoading(null);
    }
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Observe → Threads</h2>
        <p className="text-xs text-gray-600 mt-1">
          No inputs. This flow uses a fixed <span className="font-mono">thread_identifier</span>:{" "}
          <span className="font-mono font-bold">{demoThreadIdentifier}</span>
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">thread_identifier:</span> {demoThreadIdentifier}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">customer_identifier:</span> {demoCustomerIdentifier}
          </Card>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button
          className="w-full py-3"
          onClick={createLogWithThread}
          disabled={threadsLoading !== null}
        >
          1) Create log with thread id
        </Button>
        <Button
          className="w-full py-3"
          onClick={listThreads}
          disabled={threadsLoading !== null}
        >
          2) List threads
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
        <Button className="w-full py-3" disabled>
          —
        </Button>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <JsonBlock
            title="Step 1 response (Create log)"
            value={createLogResult}
            emptyText={`Click "1) Create log with thread id"`}
          />
          <JsonBlock title="Step 2 response (List threads)" value={threadsResult} emptyText={'Click "2) List threads"'} />
        </div>
      </div>
    </div>
  );
}
