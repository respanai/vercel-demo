import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // Avoid Turbopack inferring the workspace root from lockfiles outside this repo.
    root: __dirname,
  },
  serverExternalPackages: [
    "ai",
    "@ai-sdk/openai",
    "@vercel/otel",
    "@opentelemetry/api",
    "@keywordsai/tracing",
    "@traceloop/instrumentation-openai",
    "@opentelemetry/sdk-node",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/sdk-trace-base",
    "@opentelemetry/context-async-hooks",
    "@opentelemetry/resources",
    "@opentelemetry/exporter-trace-otlp-proto",
    "openai",
  ],
};

export default nextConfig;
