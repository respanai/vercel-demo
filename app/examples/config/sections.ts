export interface ExamplePage {
  label: string;
  description: string;
  href: string;
  featured?: boolean;
}

export const EXAMPLE_PAGES: ExamplePage[] = [
  {
    label: "Multi-tenant AI Service Desk",
    description: "Two tenants run concurrently through a multi-agent pipeline with per-tenant managed prompts; Respan separates traffic by customer_identifier.",
    href: "/examples/atomicworks",
    featured: true,
  },
  {
    label: "Invoice generator",
    description: "Paste invoice details; AI extracts structured fields via Gateway + JSON schema.",
    href: "/examples/invoice-generator",
  },
  {
    label: "Banking chatbot",
    description: "Internal assistant demo: ask a question; response is logged via Gateway.",
    href: "/examples/banking-chatbot",
  },
  {
    label: "Customer email + custom properties",
    description: "Gateway request that populates customer columns, filterable metadata, native custom properties, and LLM cost/tokens.",
    href: "/examples/customer-tracking",
  },
  {
    label: "SEC compliance reviewer",
    description: "Paste marketing content; AI flags Rule 206(4)-1 violations with inline highlighting.",
    href: "/examples/sec-compliance",
  },
  {
    label: "Warmly lead qualification",
    description: "Multi-step agent: classifies email, enriches company, scores ICP, analyzes intent, generates outreach.",
    href: "/examples/warmly-lead-qualification",
  },
  {
    label: "Prompt Optimization Agent",
    description: "Conversational agent for prompt evaluation and iterative improvement with multi-metric radar charts.",
    href: "/examples/prompt-optimizer",
  },
];
