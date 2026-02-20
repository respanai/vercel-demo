export interface ExamplePage {
  label: string;
  description: string;
  href: string;
}

export const EXAMPLE_PAGES: ExamplePage[] = [
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
    label: "SEC compliance reviewer",
    description: "Paste marketing content; AI flags Rule 206(4)-1 violations with inline highlighting.",
    href: "/examples/sec-compliance",
  },
{
    label: "Prompt Optimization Agent",
    description: "Conversational agent for prompt evaluation and iterative improvement with multi-metric radar charts.",
    href: "/examples/prompt-optimizer",
  },
];
