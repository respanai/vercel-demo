/**
 * Multi-tenant AI Service Desk — demo configuration
 * -------------------------------------------------
 * Two tenants run side by side through the SAME multi-agent pipeline, but each
 * is driven by its own managed prompt (and model), so behavior diverges per
 * tenant. Every run is tagged with `customer_identifier` + `thread_identifier`
 * so Respan keeps concurrent tenant traffic cleanly separated.
 *
 * The pipeline itself is modeled as a classic distributed-system request
 * fan-out (an orchestrated saga): a ticket flows through named services, each
 * a span in the trace tree — triage → specialist → knowledge → notification.
 */

export interface TenantService {
  /** Stable key used for span names + managed-prompt lookup. */
  key: ServiceKey;
  /** Human label shown in the ops console. */
  label: string;
  /** One-line description of the service's job. */
  blurb: string;
  /** Backend tool this service calls (mocked DB / AD / KB lookups). */
  tool: string;
}

export type ServiceKey =
  | "triage"
  | "identity"
  | "incident"
  | "knowledge"
  | "notification";

/**
 * The service topology, in execution order. `triage` routes the ticket; the
 * routed specialist (identity OR incident) runs next; knowledge + notification
 * always run. This produces a branching, realistic trace tree.
 */
export const SERVICES: TenantService[] = [
  { key: "triage", label: "Triage", blurb: "Classify category, priority & route", tool: "classify_ticket" },
  { key: "identity", label: "Identity", blurb: "Verify user, reset access (AD / Okta)", tool: "reset_access" },
  { key: "incident", label: "Incident", blurb: "Search / open ticket (CMDB / ServiceNow)", tool: "upsert_ticket" },
  { key: "knowledge", label: "Knowledge", blurb: "Retrieve answer from tenant KB (RAG)", tool: "rag_search" },
  { key: "notification", label: "Notify", blurb: "Escalate / notify requester", tool: "send_notification" },
];

export interface Tenant {
  id: string;
  /** Used as Respan `customer_identifier` — the per-tenant separation key. */
  customerIdentifier: string;
  displayName: string;
  industry: string;
  emoji: string;
  /** Tailwind accent for the lane (border / chip). */
  accent: string;
  model: string;
  /**
   * Per-service managed prompt IDs. Populate after running the seed script
   * (scripts/seed-atomicworks-prompts.mjs). Empty → the route falls back to a
   * built-in inline prompt so the demo still runs.
   */
  prompts: Partial<Record<ServiceKey, string>>;
}

export const TENANTS: Tenant[] = [
  {
    id: "northwind",
    customerIdentifier: "tenant_northwind_bank",
    displayName: "Northwind Bank",
    industry: "Financial services",
    emoji: "🏦",
    accent: "blue",
    model: "gpt-4o",
    prompts: {
      triage: "ba1d47489dde448c9554e1e82c18a3a9",
      identity: "41fa89c3a1b6438b918a7a6b3f33aa7e",
      incident: "62999b02037b45a6ad4eb5341729bd85",
      knowledge: "959eb971c7694d508e72ffaa3789e5c5",
      notification: "f2b607d333964c84ac4a8bdb30a90e99",
    },
  },
  {
    id: "meridian",
    customerIdentifier: "tenant_meridian_health",
    displayName: "Meridian Health",
    industry: "Healthcare",
    emoji: "🏥",
    accent: "emerald",
    model: "gpt-4o-mini",
    prompts: {
      triage: "43ee5172b17f4383aca4165f53ff8b7e",
      identity: "747e5ce0a94e486190112728ea3024d4",
      incident: "15eb2745e7ea4335a66af006cd28246a",
      knowledge: "fa17b45b9d1a49f7a87c6f1818042d58",
      notification: "8090721d075b4a3f95932c929cec0b2e",
    },
  },
];

export interface Scenario {
  id: string;
  label: string;
  /** The end-user's request that enters the service desk. */
  request: string;
  /** Which specialist triage should route to (used for the mock + UI hint). */
  route: "identity" | "incident";
}

/** Scenarios are shared across tenants — the tenant's prompt changes how each is handled. */
export const SCENARIOS: Scenario[] = [
  {
    id: "vpn_access",
    label: "VPN access request",
    request:
      "I'm locked out of the corporate VPN after the weekend password rotation and need access restored to finish month-end close.",
    route: "identity",
  },
  {
    id: "mfa_reset",
    label: "MFA reset",
    request:
      "Lost my phone with the authenticator app. I need my MFA reset so I can log back into the clinical scheduling system.",
    route: "identity",
  },
  {
    id: "laptop_down",
    label: "Laptop won't boot",
    request:
      "My work laptop shows a blue screen on startup and won't load. I have a customer review in two hours and need a fix or a loaner.",
    route: "incident",
  },
  {
    id: "portal_outage",
    label: "Portal outage",
    request:
      "The internal payments portal is returning 503 errors for our whole team since this morning. Is there a known incident?",
    route: "incident",
  },
];

function normalizeRespanBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/api$/i, "");
}

export const GATEWAY_BASE = normalizeRespanBaseUrl(
  process.env.RESPAN_BASE_URL || "https://api.respan.ai"
);

export function getTenant(id: string): Tenant | undefined {
  return TENANTS.find((t) => t.id === id);
}

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
