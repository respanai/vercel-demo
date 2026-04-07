/**
 * JSON schema for invoice extraction output.
 * Use with Respan / OpenAI response_format: { type: "json_schema", json_schema: INVOICE_EXTRACTION_JSON_SCHEMA }.
 *
 * Example output:
 * {
 *   "vendor_name": "Acme Corp",
 *   "vendor_address": "",
 *   "client_name": "Rho",
 *   "client_address": "",
 *   "invoice_number": "INV-2026-001",
 *   "issue_date": "2026-02-05",
 *   "due_date": "2026-03-07",
 *   "currency": "USD",
 *   "items": [
 *     { "description": "Consulting services", "quantity": 10, "rate": 150, "amount": 1500 }
 *   ],
 *   "payment_instructions": "Payment by wire to account 123456."
 * }
 */
export const INVOICE_EXTRACTION_JSON_SCHEMA = {
  name: "invoice_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      vendor_name: {
        type: "string",
        description: "Company or person issuing the invoice",
      },
      vendor_address: {
        type: "string",
        description: "Vendor address; use empty string if not present",
      },
      client_name: {
        type: "string",
        description: "Company or person being invoiced",
      },
      client_address: {
        type: "string",
        description: "Client address; use empty string if not present",
      },
      invoice_number: {
        type: "string",
        description: "Invoice or reference number",
      },
      issue_date: {
        type: "string",
        description: "Issue date in YYYY-MM-DD format",
      },
      due_date: {
        type: "string",
        description: "Due date in YYYY-MM-DD format",
      },
      currency: {
        type: "string",
        description: "Currency code, e.g. USD",
      },
      items: {
        type: "array",
        description: "Line items on the invoice",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "Item or service description" },
            quantity: { type: "number", description: "Quantity" },
            rate: { type: "number", description: "Unit rate or price" },
            amount: { type: "number", description: "Line total (quantity × rate)" },
          },
          required: ["description", "quantity", "rate", "amount"],
          additionalProperties: false,
        },
      },
      payment_instructions: {
        type: "string",
        description: "Payment instructions or notes; use empty string if none",
      },
    },
    required: [
      "vendor_name",
      "vendor_address",
      "client_name",
      "client_address",
      "invoice_number",
      "issue_date",
      "due_date",
      "currency",
      "items",
      "payment_instructions",
    ],
    additionalProperties: false,
  },
} as const;

export type InvoiceExtractionOutput = {
  vendor_name: string;
  vendor_address: string;
  client_name: string;
  client_address: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  payment_instructions: string;
};
