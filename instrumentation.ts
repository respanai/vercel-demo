import { registerOTel } from "@vercel/otel";
import { KeywordsAIExporter } from "@keywordsai/exporter-vercel";

export function register() {
  const envApiKey = process.env.KEYWORDSAI_API_KEY;
  if (!envApiKey) {
    console.warn(
      "KEYWORDSAI_API_KEY not set; KeywordsAI tracing will be disabled unless a key is provided at request-time. (Recommended: run locally with env vars.)",
    );
  }

  console.log("Initializing Keywords AI Tracing...");

  // We register an exporter even if KEYWORDSAI_API_KEY is missing so a request-time key
  // (forwarded from the UI) can enable tracing without adding separate endpoints.
  const traceExporter = {
    export(spans: any[], resultCallback: (result: any) => void) {
      const apiKey =
        process.env.KEYWORDSAI_API_KEY ||
        (globalThis as any).__KEYWORDSAI_RUNTIME_API_KEY__;

      if (!apiKey) {
        resultCallback({ code: 0 });
        return;
      }

      // Only send traces for Integration page (Vercel AI SDK: /api/openai/*).
      // APIs, Examples, and gateway are plain API calls; gateway is auto-logged. Do not trace them.
      // Use a whitelist: only export traces that contain a span for /api/openai/ (Integration).
      function getTraceId(span: any): string {
        return (
          span.traceId ??
          span.trace_id ??
          span.spanContext?.traceId ??
          span.context?.traceId ??
          ""
        );
      }
      function getPathUrlOrName(span: any): string {
        const attrs = span.attributes ?? {};
        const u =
          attrs["http.url"] ??
          attrs["http.target"] ??
          attrs["http.request.url"] ??
          attrs["url.path"] ??
          attrs["next.route"] ??
          attrs["url"] ??
          "";
        const pathOrUrl = typeof u === "string" ? u : String(u);
        const name = span.name ?? "";
        return pathOrUrl + " " + name;
      }
      // Paths to trace: Integration demos and Banking chatbot workflow
      const tracedPaths = ["/api/openai/", "/api/banking-chatbot", "/api/sec-compliance"];
      const integrationTraceIds = new Set<string>();
      for (const span of spans) {
        const pathUrlName = getPathUrlOrName(span);
        if (tracedPaths.some((p) => pathUrlName.includes(p))) {
          integrationTraceIds.add(getTraceId(span));
        }
      }
      const filtered = spans.filter((span: any) => integrationTraceIds.has(getTraceId(span)));

      if (filtered.length === 0) {
        resultCallback({ code: 0 });
        return;
      }

      const exporter = new KeywordsAIExporter({
        apiKey,
        baseUrl: process.env.KEYWORDSAI_BASE_URL || "https://api.keywordsai.co",
        debug: true,
      }) as any;

      Promise.resolve(exporter.export(filtered, resultCallback)).catch((err) => {
        resultCallback({
          code: 1,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    },
    shutdown() {
      return Promise.resolve();
    },
  } as any;

  registerOTel({
    serviceName: "next-app",
    traceExporter,
  });
}
