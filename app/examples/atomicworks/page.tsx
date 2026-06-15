"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiKeyInputs } from "../../components/ApiKeyInputs";
import { OpsConsole } from "./OpsConsole";
import { PLATFORM_URL } from "../../config/site";

export default function AtomicworksDemoPage() {
  const searchParams = useSearchParams();
  const embed = searchParams.get("embed") === "true";
  const [respanApiKey, setRespanApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <div className={`container mx-auto px-6 max-w-6xl ${embed ? "py-4" : "py-12"}`}>
        {!embed && (
          <>
            <div className="mb-3">
              <Link href="/examples" className="text-xs font-mono underline underline-offset-4">
                ← Back to Examples
              </Link>
            </div>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Multi-tenant AI Service Desk</h1>
                <p className="text-xs text-gray-600 mt-2 max-w-2xl">
                  One agent platform, two enterprise tenants, run concurrently. Each ticket fans out
                  through a multi-agent service pipeline (triage → specialist → knowledge → notify),
                  driven by per-tenant <span className="font-mono">managed prompts</span> through the
                  Respan gateway. Fire both tenants at once and watch Respan keep the traffic cleanly
                  separated by <span className="font-mono">customer_identifier</span>.
                </p>
              </div>
              <a
                className="shrink-0 border border-gray-200 bg-white px-3 py-2 text-xs font-mono hover:border-black"
                href={PLATFORM_URL}
                target="_blank"
                rel="noreferrer"
              >
                Platform
              </a>
            </div>
          </>
        )}

        <ApiKeyInputs
          showOpenAI={false}
          openaiApiKey={openaiApiKey}
          setOpenaiApiKey={setOpenaiApiKey}
          respanApiKey={respanApiKey}
          setRespanApiKey={setRespanApiKey}
        />

        <OpsConsole respanApiKey={respanApiKey} />

        {!embed && (
          <div className="mt-8 border-t border-gray-100 pt-4 text-[11px] text-gray-500 leading-relaxed">
            <p className="font-mono mb-1">What this exercises</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li><span className="font-mono">propagateAttributes</span> — per-tenant <span className="font-mono">customer_identifier</span> + <span className="font-mono">thread_identifier</span></li>
              <li><span className="font-mono">withWorkflow → withAgent → withTool</span> — the distributed trace tree, not tags</li>
              <li>Managed prompts pulled from Respan at runtime (a different version per tenant)</li>
              <li>Vercel AI SDK <span className="font-mono">generateText</span> through the Respan gateway → nested LLM spans</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
