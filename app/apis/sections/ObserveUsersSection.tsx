"use client";

import { useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
import { postProxy } from "../lib/postProxy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function ObserveUsersSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const demoCustomerIdentifier = "customer_user_demo123";
  const env = "prod";

  const [usersStepLoading, setUsersStepLoading] = useState<
    "create-user" | "list" | "get" | "update" | null
  >(null);
  const [createUserResult, setCreateUserResult] = useState<any>(null);
  const [usersListResult, setUsersListResult] = useState<any>(null);
  const [usersGetResult, setUsersGetResult] = useState<any>(null);
  const [usersUpdateResult, setUsersUpdateResult] = useState<any>(null);

  const users = {
    createUser: async () => {
      setUsersStepLoading("create-user");
      setCreateUserResult(null);
      try {
        const data = await postProxy("/api/respan/logs/create", respanApiKey, {
          customer_identifier: demoCustomerIdentifier,
        });
        setCreateUserResult(data);
      } finally {
        setUsersStepLoading(null);
      }
    },
    list: async () => {
      setUsersStepLoading("list");
      setUsersListResult(null);
      try {
        const data = await postProxy("/api/respan/users/list-get", respanApiKey, {
          page: 1,
          page_size: 50,
          sort_by: "-first_seen",
          environment: env,
        });
        setUsersListResult(data);
      } finally {
        setUsersStepLoading(null);
      }
    },
    get: async () => {
      setUsersStepLoading("get");
      setUsersGetResult(null);
      try {
        const data = await postProxy("/api/respan/users/get", respanApiKey, {
          customer_identifier: demoCustomerIdentifier,
          environment: env,
        });
        setUsersGetResult(data);
      } finally {
        setUsersStepLoading(null);
      }
    },
    update: async () => {
      setUsersStepLoading("update");
      setUsersUpdateResult(null);
      try {
        const data = await postProxy("/api/respan/users/update", respanApiKey, {
          customer_identifier: demoCustomerIdentifier,
          environment: env,
          period_budget: 200.0,
          metadata: { plan: "pro", updated_by: "respan-demo" },
        });
        setUsersUpdateResult(data);
      } finally {
        setUsersStepLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Observe → Users</h2>
        <p className="text-xs text-gray-600 mt-1">
          No inputs. This flow uses a fixed <span className="font-mono">customer_identifier</span>:{" "}
          <span className="font-mono font-bold">{demoCustomerIdentifier}</span>
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">customer_identifier:</span> {demoCustomerIdentifier}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">environment:</span> {env}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">list params:</span> {JSON.stringify({ page: 1, page_size: 50, sort_by: "-first_seen" })}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">update payload:</span> {JSON.stringify({ period_budget: 200.0, metadata: { plan: "pro", updated_by: "respan-demo" } })}
          </Card>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Button
          className="w-full py-3"
          onClick={users.createUser}
          disabled={usersStepLoading !== null}
        >
          1) Create user (via Create log)
        </Button>
        <Button
          className="w-full py-3"
          onClick={users.list}
          disabled={usersStepLoading !== null}
        >
          2) List users
        </Button>
        <Button
          className="w-full py-3"
          onClick={users.get}
          disabled={usersStepLoading !== null}
        >
          3) Retrieve user
        </Button>
        <Button
          className="w-full py-3"
          onClick={users.update}
          disabled={usersStepLoading !== null}
        >
          4) Update user
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock
          title="Step 1 response (Create log → creates user)"
          value={createUserResult}
          emptyText={`Click "1) Create user (via Create log)"`}
        />
        <JsonBlock title="Step 2 response (List users)" value={usersListResult} emptyText={'Click "2) List users"'} />
        <JsonBlock title="Step 3 response (Retrieve user)" value={usersGetResult} emptyText={'Click "3) Retrieve user"'} />
        <JsonBlock title="Step 4 response (Update user)" value={usersUpdateResult} emptyText={'Click "4) Update user"'} />
      </div>
    </div>
  );
}
