/**
 * Commit + deploy the seeded Atomicworks managed prompts.
 *
 * Seeded versions start as drafts (readonly=false) and can't be deployed
 * directly. Flow per prompt: commit the draft (locks v1) → deploy v1.
 *
 * Usage: node scripts/deploy-atomicworks-prompts.mjs
 */
import { readFileSync } from "node:fs";

const BASE = process.env.RESPAN_BASE_URL || "https://api.respan.ai";

function getKey() {
  if (process.env.RESPAN_API_KEY) return process.env.RESPAN_API_KEY.trim();
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return env.match(/^RESPAN_API_KEY=(.*)$/m)?.[1].replace(/^["']|["']$/g, "").trim();
}

const PROMPT_IDS = {
  "northwind/triage": "ba1d47489dde448c9554e1e82c18a3a9",
  "northwind/identity": "41fa89c3a1b6438b918a7a6b3f33aa7e",
  "northwind/incident": "62999b02037b45a6ad4eb5341729bd85",
  "northwind/knowledge": "959eb971c7694d508e72ffaa3789e5c5",
  "northwind/notification": "f2b607d333964c84ac4a8bdb30a90e99",
  "meridian/triage": "43ee5172b17f4383aca4165f53ff8b7e",
  "meridian/identity": "747e5ce0a94e486190112728ea3024d4",
  "meridian/incident": "15eb2745e7ea4335a66af006cd28246a",
  "meridian/knowledge": "fa17b45b9d1a49f7a87c6f1818042d58",
  "meridian/notification": "8090721d075b4a3f95932c929cec0b2e",
};

async function api(path, body, key, method = "POST") {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function main() {
  const key = getKey();
  if (!key) { console.error("Missing RESPAN_API_KEY"); process.exit(1); }

  for (const [label, id] of Object.entries(PROMPT_IDS)) {
    try {
      // 1) Commit the current draft (locks v1, opens a new draft).
      const commit = await api(`/prompts/${id}/commits/`, { description: "deploy seed v1" }, key);
      // 2) Deploy v1.
      const deploy = await api(`/prompts/${id}/deployments/`, { version: 1 }, key);
      const okC = commit.ok ? "commit✓" : `commit✗(${commit.status})`;
      const okD = deploy.ok ? "deploy✓" : `deploy✗(${deploy.status})`;
      console.error(`${label.padEnd(24)} ${okC} ${okD}` + (deploy.ok ? "" : ` ${deploy.text.slice(0, 160)}`));
    } catch (err) {
      console.error(`${label}: ${err.message}`);
    }
  }
}

main();
