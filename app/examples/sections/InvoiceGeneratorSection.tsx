"use client";

import { useState } from "react";
import { postProxy } from "../../apis/lib/postProxy";
import {
  INVOICE_EXTRACTION_JSON_SCHEMA,
  type InvoiceExtractionOutput,
} from "./invoiceExtractionSchema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const EXTRACTION_SYSTEM_PROMPT = `You are an invoice data extraction assistant. Extract structured invoice fields from the user's text. Include as much as is clearly stated; use empty string or omit optional fields if not present. For dates use YYYY-MM-DD when possible. For items always include description, quantity, and rate; compute amount if not given. Output valid JSON only.`;

export interface InvoiceData {
  vendor_name: string;
  vendor_address: string;
  client_name: string;
  client_address: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  items: Array<{ description: string; quantity: number; rate: number; amount?: number }>;
  payment_instructions: string;
}

const emptyInvoice = (): InvoiceData => ({
  vendor_name: "",
  vendor_address: "",
  client_name: "",
  client_address: "",
  invoice_number: "",
  issue_date: "",
  due_date: "",
  currency: "USD",
  items: [{ description: "", quantity: 1, rate: 0, amount: 0 }],
  payment_instructions: "",
});

/** Parse JSON schema output from the model into form state. */
function parseExtraction(content: string | undefined): InvoiceData | null {
  if (!content || typeof content !== "string") return null;
  try {
    const out = JSON.parse(content) as InvoiceExtractionOutput;
    return {
      vendor_name: out.vendor_name ?? "",
      vendor_address: out.vendor_address ?? "",
      client_name: out.client_name ?? "",
      client_address: out.client_address ?? "",
      invoice_number: out.invoice_number ?? "",
      issue_date: out.issue_date ?? "",
      due_date: out.due_date ?? "",
      currency: out.currency ?? "USD",
      items:
        Array.isArray(out.items) && out.items.length > 0
          ? out.items.map((i) => ({
              description: i.description ?? "",
              quantity: Number(i.quantity) || 0,
              rate: Number(i.rate) || 0,
              amount: Number(i.amount) ?? (i.quantity || 0) * (i.rate || 0),
            }))
          : [{ description: "", quantity: 1, rate: 0, amount: 0 }],
      payment_instructions: out.payment_instructions ?? "",
    };
  } catch {
    return null;
  }
}

export function InvoiceGeneratorSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;
  const [promptId, setPromptId] = useState("dde652380a9a43529e8fe39ac4462454");
  const [rawText, setRawText] = useState(
    "Invoice from Acme Corp to Rho. Invoice #INV-2026-001. Issue date Feb 5 2026, due March 7 2026. USD. Item: Consulting services, 10 hours at $150/hr. Payment by wire to account 123456."
  );
  const [formData, setFormData] = useState<InvoiceData>(emptyInvoice());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<string | null>(null);

  const runAutofill = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = promptId.trim()
        ? {
            prompt: {
              prompt_id: promptId.trim(),
              variables: { raw_invoice_text: rawText },
              override: true,
              override_params: {
                response_format: { type: "json_schema" as const, json_schema: INVOICE_EXTRACTION_JSON_SCHEMA },
                max_tokens: 1024,
              },
            },
          }
        : {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
              { role: "user", content: rawText },
            ],
            response_format: { type: "json_schema" as const, json_schema: INVOICE_EXTRACTION_JSON_SCHEMA },
            max_tokens: 1024,
          };

      const data = await postProxy("/api/respan/gateway/chat-completions", respanApiKey, body);
      const content = (data?.response as any)?.choices?.[0]?.message?.content;
      setLastInput(rawText);
      setLastOutput(typeof content === "string" ? content : content ? JSON.stringify(content, null, 2) : null);
      const parsed = parseExtraction(content);
      if (parsed) setFormData(parsed);
      else if (data?.error) setError(data.error as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const subtotal = formData.items.reduce((sum, i) => sum + (i.quantity * i.rate), 0);
  const total = subtotal;

  return (
    <div className="mb-12">
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: inputs + form fields */}
        <div className="space-y-6">
          <Card variant="muted" className="p-4">
            <Label className="mb-2 block">Prompt ID (optional)</Label>
            <Input
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              placeholder="e.g. from Respan Prompt Management"
              disabled={loading}
            />
          </Card>

          <Card variant="muted" className="p-4">
            <Label className="mb-2 block">Or let AI do it for you</Label>
            <p className="text-[11px] text-gray-500 mb-2">
              Include as much detail about your invoice as possible; we will fill the fields below.
            </p>
            <Textarea
              className="min-h-[100px]"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste or type invoice details…"
              disabled={loading}
            />
            <Button
              className="mt-3 w-full"
              variant="primary"
              onClick={runAutofill}
              disabled={loading}
            >
              {loading ? "Filling…" : "Autofill invoice"}
            </Button>
          </Card>

          {error && (
            <Card className="border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </Card>
          )}

          <Card className="p-4">
            <Label className="mb-3 block">Your company & who you're invoicing</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">From (vendor)</label>
                <Input
                  value={formData.vendor_name}
                  onChange={(e) => setFormData((d) => ({ ...d, vendor_name: e.target.value }))}
                  placeholder="Company name"
                />
                <Input
                  className="mt-1"
                  value={formData.vendor_address}
                  onChange={(e) => setFormData((d) => ({ ...d, vendor_address: e.target.value }))}
                  placeholder="Address"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">To (client)</label>
                <Input
                  value={formData.client_name}
                  onChange={(e) => setFormData((d) => ({ ...d, client_name: e.target.value }))}
                  placeholder="Company name"
                />
                <Input
                  className="mt-1"
                  value={formData.client_address}
                  onChange={(e) => setFormData((d) => ({ ...d, client_address: e.target.value }))}
                  placeholder="Address"
                />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <Label className="mb-3 block">Invoice details</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Invoice #</label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData((d) => ({ ...d, invoice_number: e.target.value }))}
                  placeholder="Number"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Issue date</label>
                <Input
                  value={formData.issue_date}
                  onChange={(e) => setFormData((d) => ({ ...d, issue_date: e.target.value }))}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Due date</label>
                <Input
                  value={formData.due_date}
                  onChange={(e) => setFormData((d) => ({ ...d, due_date: e.target.value }))}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Currency</label>
                <Input
                  value={formData.currency}
                  onChange={(e) => setFormData((d) => ({ ...d, currency: e.target.value }))}
                  placeholder="USD"
                />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <Label className="mb-3 block">Items</Label>
            <div className="space-y-2">
              {formData.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 text-xs">
                  <Input
                    className="col-span-5"
                    value={item.description}
                    onChange={(e) => {
                      const next = [...formData.items];
                      next[idx] = { ...next[idx], description: e.target.value };
                      setFormData((d) => ({ ...d, items: next }));
                    }}
                    placeholder="Description"
                  />
                  <Input
                    type="number"
                    className="col-span-2"
                    value={item.quantity || ""}
                    onChange={(e) => {
                      const next = [...formData.items];
                      next[idx] = { ...next[idx], quantity: Number(e.target.value) || 0 };
                      setFormData((d) => ({ ...d, items: next }));
                    }}
                    placeholder="Qty"
                  />
                  <Input
                    type="number"
                    className="col-span-2"
                    value={item.rate || ""}
                    onChange={(e) => {
                      const next = [...formData.items];
                      next[idx] = { ...next[idx], rate: Number(e.target.value) || 0 };
                      setFormData((d) => ({ ...d, items: next }));
                    }}
                    placeholder="Rate"
                  />
                  <span className="col-span-3 p-2 text-gray-600">
                    {formData.currency} {(item.quantity * item.rate).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <Button
              className="mt-2"
              onClick={() =>
                setFormData((d) => ({
                  ...d,
                  items: [...d.items, { description: "", quantity: 1, rate: 0, amount: 0 }],
                }))
              }
            >
              Add item
            </Button>
          </Card>

          <Card className="p-4">
            <Label className="mb-2 block">Payment instructions</Label>
            <Textarea
              className="min-h-[60px]"
              value={formData.payment_instructions}
              onChange={(e) => setFormData((d) => ({ ...d, payment_instructions: e.target.value }))}
              placeholder="Add payment instructions here…"
            />
          </Card>
        </div>

        {/* Right: invoice preview */}
        <Card className="p-6">
          <Label className="mb-4 block">Invoice preview</Label>
          <div className="space-y-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Payable</span>
              <span className="font-mono">{formData.currency} {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Due</span>
              <span>{formData.due_date || "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Issued</span>
              <span>{formData.issue_date || "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Ref</span>
              <span>{formData.invoice_number || "—"}</span>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[10px] text-gray-500 mb-1">From</p>
              <p className="text-xs">{formData.vendor_name || "—"}</p>
              {formData.vendor_address && <p className="text-[11px] text-gray-500">{formData.vendor_address}</p>}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">To</p>
              <p className="text-xs">{formData.client_name || "—"}</p>
              {formData.client_address && <p className="text-[11px] text-gray-500">{formData.client_address}</p>}
            </div>
            <table className="w-full text-xs border-collapse mt-4">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-bold uppercase text-gray-500">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2">QTY</th>
                  <th className="text-right py-2">RATE</th>
                  <th className="text-right py-2">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{row.description || "—"}</td>
                    <td className="text-right py-2">{row.quantity}</td>
                    <td className="text-right py-2 font-mono">{formData.currency} {row.rate.toFixed(2)}</td>
                    <td className="text-right py-2 font-mono">{formData.currency} {(row.quantity * row.rate).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-gray-200 pt-4 mt-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono">{formData.currency} {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="font-mono">{formData.currency} {total.toFixed(2)}</span>
              </div>
            </div>
            {formData.payment_instructions && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-1">Payment instructions</p>
                <p className="text-xs text-gray-700">{formData.payment_instructions}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Separate section: Input & Output (last run) — not merged with form */}
      {(lastInput !== null || lastOutput !== null) && (
        <div className="mt-10 pt-8 border-t-2 border-gray-200">
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600 font-mono mb-4">
            Input & output (last run)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card variant="muted" className="p-4">
              <Label className="mb-2 block text-gray-500">Input (prompt / raw text)</Label>
              <Card className="p-3 text-xs font-mono overflow-auto max-h-56 whitespace-pre-wrap">
                {promptId.trim() ? (
                  <>
                    <span className="text-gray-500">Prompt ID: </span>
                    <span className="text-black">{promptId.trim()}</span>
                    <span className="text-gray-500 block mt-2">Variable raw_invoice_text:</span>
                    <span className="text-black block mt-1">{lastInput ?? "—"}</span>
                  </>
                ) : (
                  lastInput ?? "—"
                )}
              </Card>
            </Card>
            <Card variant="muted" className="p-4">
              <Label className="mb-2 block text-gray-500">Output (extracted JSON)</Label>
              <Card className="p-3 overflow-auto max-h-56">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                  {lastOutput ?? "—"}
                </pre>
              </Card>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
