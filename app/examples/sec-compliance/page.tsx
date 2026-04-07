"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiKeyInputs } from "../../components/ApiKeyInputs";
import { SecComplianceSection } from "../sections/SecComplianceSection";
import { PLATFORM_URL } from "../../config/site";

export default function SecCompliancePage() {
  const [respanApiKey, setRespanApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <div className="container mx-auto px-6 py-12 max-w-6xl">
        <div className="mb-3">
          <Link href="/examples" className="text-xs font-mono underline underline-offset-4">
            ← Back to Examples
          </Link>
        </div>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SEC Marketing Rule Reviewer</h1>
            <p className="text-xs text-gray-600 mt-2">
              Rule 206(4)-1 · Automated Compliance Screening
            </p>
          </div>
          <a
            className="border border-gray-200 bg-white px-3 py-2 text-xs font-mono hover:border-black"
            href={PLATFORM_URL}
            target="_blank"
            rel="noreferrer"
          >
            Platform
          </a>
        </div>

        <ApiKeyInputs
          showOpenAI={false}
          openaiApiKey={openaiApiKey}
          setOpenaiApiKey={setOpenaiApiKey}
          respanApiKey={respanApiKey}
          setRespanApiKey={setRespanApiKey}
        />

        <SecComplianceSection respanApiKey={respanApiKey} />
      </div>
    </div>
  );
}
