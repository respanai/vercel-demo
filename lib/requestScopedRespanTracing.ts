import { AsyncLocalStorage } from "node:async_hooks";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { getRespanBaseUrl } from "./respan";

const REQUEST_RESPAN_API_KEY_ATTR = "vercel_demo.internal.respan_api_key";
export const REQUEST_RESPAN_API_KEY_METADATA_KEY = "__vercel_demo_respan_api_key";
const REQUEST_RESPAN_API_KEY_METADATA_ATTR = `respan.metadata.${REQUEST_RESPAN_API_KEY_METADATA_KEY}`;

const requestApiKeyStorage = new AsyncLocalStorage<string>();

export function runWithRequestRespanApiKey<T>(apiKey: string, fn: () => T): T {
  return requestApiKeyStorage.run(apiKey.trim(), fn);
}

export function attachRequestRespanApiKey(span: ReadableSpan): void {
  const apiKey = requestApiKeyStorage.getStore()?.trim();
  if (!apiKey) return;

  (span.attributes as Record<string, unknown>)[REQUEST_RESPAN_API_KEY_ATTR] = apiKey;
}

export class RequestScopedRespanOtlpExporter implements SpanExporter {
  private readonly traceApiKeys = new Map<string, string>();
  private readonly traceApiKeyOrder: string[] = [];

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const grouped = new Map<string, ReadableSpan[]>();

    for (const span of spans) {
      const traceId = getTraceId(span);
      const apiKey = getSpanApiKey(span);
      if (traceId && apiKey) {
        this.rememberTraceApiKey(traceId, apiKey);
      }
    }

    for (const span of spans) {
      const traceId = getTraceId(span);
      const apiKey = getSpanApiKey(span) ?? (traceId ? this.traceApiKeys.get(traceId) : undefined);
      if (!apiKey) continue;

      const cleanSpan = cloneSpanWithoutRequestKey(span);
      const group = grouped.get(apiKey);
      if (group) {
        group.push(cleanSpan);
      } else {
        grouped.set(apiKey, [cleanSpan]);
      }
    }

    if (grouped.size === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    void Promise.all(
      Array.from(grouped.entries()).map(([apiKey, group]) =>
        exportGroup(apiKey, group),
      ),
    )
      .then(() => resultCallback({ code: ExportResultCode.SUCCESS }))
      .catch((error) => {
        resultCallback({
          code: ExportResultCode.FAILED,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  private rememberTraceApiKey(traceId: string, apiKey: string): void {
    if (!this.traceApiKeys.has(traceId)) {
      this.traceApiKeyOrder.push(traceId);
    }
    this.traceApiKeys.set(traceId, apiKey);

    while (this.traceApiKeyOrder.length > 500) {
      const oldest = this.traceApiKeyOrder.shift();
      if (oldest) this.traceApiKeys.delete(oldest);
    }
  }
}

function getSpanApiKey(span: ReadableSpan): string | undefined {
  const attributes = span.attributes as Record<string, unknown>;
  const value = attributes[REQUEST_RESPAN_API_KEY_ATTR] ?? attributes[REQUEST_RESPAN_API_KEY_METADATA_ATTR];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getTraceId(span: ReadableSpan): string | undefined {
  return span.spanContext().traceId;
}

function cloneSpanWithoutRequestKey(span: ReadableSpan): ReadableSpan {
  const attributes = { ...(span.attributes as Record<string, unknown>) };
  delete attributes[REQUEST_RESPAN_API_KEY_ATTR];
  delete attributes[REQUEST_RESPAN_API_KEY_METADATA_ATTR];

  const clone = Object.create(Object.getPrototypeOf(span));
  Object.assign(clone, span);
  Object.defineProperty(clone, "attributes", {
    value: attributes,
    enumerable: true,
    configurable: true,
  });
  return clone as ReadableSpan;
}

async function exportGroup(apiKey: string, spans: ReadableSpan[]): Promise<void> {
  const exporter = new OTLPTraceExporter({
    url: `${getRespanBaseUrl()}/api/v2/traces`,
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  await new Promise<void>((resolve, reject) => {
    exporter.export(spans, (result) => {
      if (result.code === ExportResultCode.SUCCESS) {
        resolve();
        return;
      }
      reject(result.error ?? new Error("Respan trace export failed"));
    });
  });

  await exporter.shutdown().catch(() => undefined);
}
