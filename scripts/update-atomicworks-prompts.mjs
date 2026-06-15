/**
 * Update the Atomicworks managed prompts to a 2-message template:
 *   system: role + {{tenant}}/{{industry}} instructions
 *   user:   the actual request as {{request}} (+ {{triage_note}} context)
 *
 * This makes the user request a real managed-prompt VARIABLE (only {{...}} in a
 * template substitutes), and — once the route renders these client-side — puts
 * the full rendered prompt into the trace span.
 *
 * Per prompt: create new version (with new messages) -> commit -> deploy.
 * Usage: node scripts/update-atomicworks-prompts.mjs
 */
import { readFileSync } from "node:fs";

const BASE = process.env.RESPAN_BASE_URL || "https://api.respan.ai";

function getKey() {
  if (process.env.RESPAN_API_KEY) return process.env.RESPAN_API_KEY.trim();
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return env.match(/^RESPAN_API_KEY=(.*)$/m)?.[1].replace(/^["']|["']$/g, "").trim();
}

const TENANTS = {
  northwind: { model: "gpt-4o" },
  meridian: { model: "gpt-4o-mini" },
};

const PROMPT_IDS = {
  northwind: {
    triage: "ba1d47489dde448c9554e1e82c18a3a9",
    identity: "41fa89c3a1b6438b918a7a6b3f33aa7e",
    incident: "62999b02037b45a6ad4eb5341729bd85",
    knowledge: "959eb971c7694d508e72ffaa3789e5c5",
    notification: "f2b607d333964c84ac4a8bdb30a90e99",
  },
  meridian: {
    triage: "43ee5172b17f4383aca4165f53ff8b7e",
    identity: "747e5ce0a94e486190112728ea3024d4",
    incident: "15eb2745e7ea4335a66af006cd28246a",
    knowledge: "fa17b45b9d1a49f7a87c6f1818042d58",
    notification: "8090721d075b4a3f95932c929cec0b2e",
  },
};

// System content per tenant/service ({{tenant}}/{{industry}} rendered at runtime).
const SYSTEM = {
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

// Uniform user turn — request is now a managed-prompt variable.
const USER_TEMPLATE = "Incoming request:\n{{request}}\n\nTriage note / prior context: {{triage_note}}";

async function api(path, body, key) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  const key = getKey();
  if (!key) { console.error("Missing RESPAN_API_KEY"); process.exit(1); }

  for (const tenantId of Object.keys(PROMPT_IDS)) {
    for (const [service, id] of Object.entries(PROMPT_IDS[tenantId])) {
      const label = `${tenantId}/${service}`;
      try {
        const messages = [
          { role: "system", content: SYSTEM[tenantId][service] },
          { role: "user", content: USER_TEMPLATE },
        ];
        // 1) New draft version with the 2-message template.
        const created = await api(`/prompts/${id}/versions/`, {
          messages, model: TENANTS[tenantId].model, temperature: 0.3, description: "request as variable",
        }, key);
        const version = created.json?.version ?? created.json?.response?.version;
        if (!created.ok || version == null) throw new Error(`create failed (${created.status}) ${created.text.slice(0, 140)}`);
        // 2) Commit the draft (locks it), then 3) deploy it.
        await api(`/prompts/${id}/commits/`, { description: "request as variable" }, key);
        const deploy = await api(`/prompts/${id}/deployments/`, { version }, key);
        console.error(`${label.padEnd(24)} v${version} ${deploy.ok ? "deploy✓" : `deploy✗(${deploy.status}) ${deploy.text.slice(0,120)}`}`);
      } catch (err) {
        console.error(`${label}: ${err.message}`);
      }
    }
  }
}

main();
