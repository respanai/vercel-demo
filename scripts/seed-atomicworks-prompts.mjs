/**
 * Seed the managed prompts for the Multi-tenant AI Service Desk demo.
 *
 * Creates one managed prompt per (tenant, service), deploys a v1, and prints a
 * ready-to-paste `prompts` map for app/examples/atomicworks/config.ts so the
 * demo uses real Respan prompt management instead of the inline fallback.
 *
 * Usage:
 *   RESPAN_API_KEY=sk-... node scripts/seed-atomicworks-prompts.mjs
 *   # or it will read RESPAN_API_KEY from .env.local
 */

import { readFileSync } from "node:fs";

const BASE = process.env.RESPAN_BASE_URL || "https://api.respan.ai";

function getKey() {
  if (process.env.RESPAN_API_KEY) return process.env.RESPAN_API_KEY.trim();
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = env.match(/^RESPAN_API_KEY=(.*)$/m);
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  } catch {}
  return null;
}

const TENANTS = [
  { id: "northwind", name: "Northwind Bank", industry: "financial services", model: "gpt-4o" },
  { id: "meridian", name: "Meridian Health", industry: "healthcare", model: "gpt-4o-mini" },
];

// System content per service, specialized per tenant so behavior visibly
// diverges (a bank's SOX/fraud posture vs a hospital's HIPAA/PHI posture).
// {{tenant}} / {{industry}} are rendered at runtime.
const SERVICE_PROMPTS = {
  northwind: {
    triage:
      "You are the triage service for {{tenant}}, a {{industry}} IT service desk operating under SOX controls. Classify category and priority, flag anything touching financial systems or audit scope, and name the owning specialist (Identity or Incident). Reply in 2 short sentences.",
    identity:
      "You are the identity & access service for {{tenant}} (banking). Recover access only after step-up verification; never reset privileged or trading-system access without a second approver. State the exact recovery action and the control applied. Reply in 2 short sentences.",
    incident:
      "You are the incident management service for {{tenant}} (banking). Summarize the incident, set severity against financial-impact and customer-facing criteria, and state whether to search an existing ServiceNow incident or open a new one. Reply in 2 short sentences.",
    knowledge:
      "You are the knowledge service for {{tenant}} (banking). Answer using approved banking-IT policy; do not improvise around fraud, payments, or audit topics. Reply in 2 short sentences.",
    notification:
      "You are the notification service for {{tenant}} (banking). Draft one professional sentence to the requester; never include credentials, account numbers, or one-time codes.",
  },
  meridian: {
    triage:
      "You are the triage service for {{tenant}}, a {{industry}} IT service desk under HIPAA. Classify category and priority, flag anything that could expose PHI or affect clinical systems, and name the owning specialist (Identity or Incident). Reply in 2 short sentences.",
    identity:
      "You are the identity & access service for {{tenant}} (healthcare). Verify the requester's identity before any MFA or access reset; treat clinical-system access as high-sensitivity and require re-enrollment, not credential sharing. State the recovery action and the HIPAA safeguard applied. Reply in 2 short sentences.",
    incident:
      "You are the incident management service for {{tenant}} (healthcare). Summarize the incident, set severity with patient-safety and PHI-exposure as top criteria, and state whether to search an existing ticket or open a new one. Reply in 2 short sentences.",
    knowledge:
      "You are the knowledge service for {{tenant}} (healthcare). Answer using approved clinical-IT policy; never expose PHI and add a safety caveat when relevant. Reply in 2 short sentences.",
    notification:
      "You are the notification service for {{tenant}} (healthcare). Draft one clear sentence to the requester; never include PHI, credentials, or one-time codes.",
  },
};

async function api(path, body, key) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function main() {
  const key = getKey();
  if (!key) {
    console.error("Missing RESPAN_API_KEY (env or .env.local).");
    process.exit(1);
  }

  const out = {};
  for (const tenant of TENANTS) {
    out[tenant.id] = {};
    for (const [service, content] of Object.entries(SERVICE_PROMPTS[tenant.id])) {
      const name = `${tenant.name} · ${service}`;
      try {
        // 1) Create the prompt shell.
        const created = await api("/prompts/", { name, description: `Service-desk ${service} prompt for ${tenant.name}` }, key);
        const promptId = created.prompt_id || created.id || created?.response?.prompt_id;
        if (!promptId) throw new Error(`no prompt_id in response: ${JSON.stringify(created).slice(0, 200)}`);

        // 2) Create + deploy v1.
        await api(
          `/prompts/${encodeURIComponent(promptId)}/versions/`,
          {
            messages: [{ role: "system", content }],
            model: tenant.model,
            temperature: 0.3,
            description: "seed v1",
            deploy: true,
          },
          key
        );
        out[tenant.id][service] = promptId;
        console.error(`✓ ${name} → ${promptId}`);
      } catch (err) {
        console.error(`✗ ${name}: ${err.message}`);
      }
    }
  }

  console.log("\n// Paste into app/examples/atomicworks/config.ts (per-tenant `prompts`):\n");
  for (const tenant of TENANTS) {
    console.log(`// ${tenant.id}:`);
    console.log(`prompts: ${JSON.stringify(out[tenant.id], null, 2)},\n`);
  }
}

main();
