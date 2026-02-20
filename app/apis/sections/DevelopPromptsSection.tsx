"use client";

import { useMemo, useState } from "react";
import { JsonBlock } from "../../components/JsonBlock";
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

export function DevelopPromptsSection(props: { keywordsaiApiKey: string }) {
  const { keywordsaiApiKey } = props;

  const demoPromptName = "Demo prompt (vercel-demo)";
  const demoPromptDescription = "Created by /apis → Develop → Prompts (fixed inputs).";
  const demoPromptNameUpdated = "Demo prompt (vercel-demo) — updated";
  const demoPromptDescriptionUpdated = "Updated by /apis → Develop → Prompts (fixed inputs).";

  const demoMessages = useMemo(
    () => [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello, how are you?" },
    ],
    [],
  );

  const [loading, setLoading] = useState<
    | "list-prompts"
    | "create-prompt"
    | "update-prompt"
    | "delete-prompt"
    | "list-versions"
    | "create-version"
    | "update-version"
    | "delete-version"
    | null
  >(null);

  const [promptId, setPromptId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);

  const [r1, setR1] = useState<any>(null);
  const [r2, setR2] = useState<any>(null);
  const [r3, setR3] = useState<any>(null);
  const [r4, setR4] = useState<any>(null);
  const [r5, setR5] = useState<any>(null);
  const [r6, setR6] = useState<any>(null);
  const [r7, setR7] = useState<any>(null);
  const [r8, setR8] = useState<any>(null);

  const actions = {
    listPrompts: async () => {
      setLoading("list-prompts");
      setR1(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/list", keywordsaiApiKey, {});
        setR1(data);
      } finally {
        setLoading(null);
      }
    },
    createPrompt: async () => {
      setLoading("create-prompt");
      setR2(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/create", keywordsaiApiKey, {
          name: demoPromptName,
          description: demoPromptDescription,
        });
        setR2(data);
        const id = pickId((data as any)?.response, ["id", "prompt_id", "promptId"]);
        if (id) setPromptId(id);
      } finally {
        setLoading(null);
      }
    },
    updatePrompt: async () => {
      if (!promptId) return;
      setLoading("update-prompt");
      setR3(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/update", keywordsaiApiKey, {
          prompt_id: promptId,
          name: demoPromptNameUpdated,
          description: demoPromptDescriptionUpdated,
        });
        setR3(data);
      } finally {
        setLoading(null);
      }
    },
    deletePrompt: async () => {
      if (!promptId) return;
      setLoading("delete-prompt");
      setR4(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/delete", keywordsaiApiKey, { prompt_id: promptId });
        setR4(data);
      } finally {
        setLoading(null);
      }
    },
    listVersions: async () => {
      if (!promptId) return;
      setLoading("list-versions");
      setR5(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/versions/list", keywordsaiApiKey, { prompt_id: promptId });
        setR5(data);
      } finally {
        setLoading(null);
      }
    },
    createVersion: async () => {
      if (!promptId) return;
      setLoading("create-version");
      setR6(null);
      try {
        const createData = await postProxy("/api/keywordsai/prompts/versions/create", keywordsaiApiKey, {
          prompt_id: promptId,
          description: "Version created by vercel-demo (fixed inputs).",
          messages: demoMessages,
          model: "gpt-4o-mini",
          stream: false,
          temperature: 0.7,
        });
        const id = pickId((createData as any)?.response, ["id", "prompt_version_id", "promptVersionId", "version"]);
        if (id) {
          setVersionId(id);
          // Deploy the newly created version via PATCH
          const deployData = await postProxy("/api/keywordsai/prompts/versions/update", keywordsaiApiKey, {
            prompt_id: promptId,
            prompt_version_id: id,
            deploy: true,
          });
          setR6({ create: createData, deploy: deployData });
        } else {
          setR6(createData);
        }
      } finally {
        setLoading(null);
      }
    },
    updateVersion: async () => {
      if (!promptId || !versionId) return;
      setLoading("update-version");
      setR7(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/versions/update", keywordsaiApiKey, {
          prompt_id: promptId,
          prompt_version_id: versionId,
          messages: demoMessages,
          model: "gpt-4o-mini",
          temperature: 0.5,
          deploy: false,
        });
        setR7(data);
      } finally {
        setLoading(null);
      }
    },
    deleteVersion: async () => {
      if (!promptId || !versionId) return;
      setLoading("delete-version");
      setR8(null);
      try {
        const data = await postProxy("/api/keywordsai/prompts/versions/delete", keywordsaiApiKey, {
          prompt_id: promptId,
          prompt_version_id: versionId,
        });
        setR8(data);
      } finally {
        setLoading(null);
      }
    },
  };

  return (
    <div className="mb-12">
      <div className="mb-4">
        <h2 className="text-sm font-bold">Develop → Prompts</h2>
        <p className="text-xs text-gray-600 mt-1">
          No inputs. This section exposes the full prompts + versions surface area (8 methods) using fixed payloads and
          derived IDs.
        </p>
      </div>

      <Card variant="muted" className="mb-4 p-4">
        <Label className="mb-2 block">Fixed inputs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">name:</span> {demoPromptName}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">model:</span> gpt-4o-mini
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">update name:</span> {demoPromptNameUpdated}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">update description:</span> {demoPromptDescriptionUpdated}
          </Card>
        </div>
      </Card>

      <div className="mb-4">
        <Label className="mb-2 block">Derived IDs</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">prompt_id:</span> {promptId || "—"}
          </Card>
          <Card className="p-3 text-xs font-mono">
            <span className="text-gray-400">prompt_version_id:</span> {versionId || "—"}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Button className="w-full py-3" onClick={actions.listPrompts} disabled={loading !== null}>
          1) List prompts
        </Button>
        <Button className="w-full py-3" onClick={actions.createPrompt} disabled={loading !== null}>
          2) Create prompt
        </Button>
        <Button className="w-full py-3" onClick={actions.updatePrompt} disabled={loading !== null || !promptId}>
          3) Update prompt
        </Button>
        <Button className="w-full py-3" onClick={actions.deletePrompt} disabled={loading !== null || !promptId}>
          4) Delete prompt
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button className="w-full py-3" onClick={actions.listVersions} disabled={loading !== null || !promptId}>
          5) List versions
        </Button>
        <Button className="w-full py-3" onClick={actions.createVersion} disabled={loading !== null || !promptId}>
          6) Create version
        </Button>
        <Button className="w-full py-3" onClick={actions.updateVersion} disabled={loading !== null || !promptId || !versionId}>
          7) Update version
        </Button>
        <Button className="w-full py-3" onClick={actions.deleteVersion} disabled={loading !== null || !promptId || !versionId}>
          8) Delete version
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <JsonBlock title="1) List prompts response" value={r1} emptyText={'Click "1) List prompts"'} />
        <JsonBlock title="2) Create prompt response" value={r2} emptyText={'Click "2) Create prompt"'} />
        <JsonBlock title="3) Update prompt response" value={r3} emptyText={'Click "3) Update prompt"'} />
        <JsonBlock title="4) Delete prompt response" value={r4} emptyText={'Click "4) Delete prompt"'} />
        <JsonBlock title="5) List versions response" value={r5} emptyText={'Click "5) List versions"'} />
        <JsonBlock title="6) Create version response" value={r6} emptyText={'Click "6) Create version"'} />
        <JsonBlock title="7) Update version response" value={r7} emptyText={'Click "7) Update version"'} />
        <JsonBlock title="8) Delete version response" value={r8} emptyText={'Click "8) Delete version"'} />
      </div>
    </div>
  );
}
