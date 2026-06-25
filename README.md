# Respan Vercel AI SDK Demo

A Next.js demo application showcasing Respan tracing, API workflows, and gateway-backed model calls with the Vercel AI SDK.

## What This Demo Includes

1. **APIs**: Interactive examples for Respan logs, traces, users, threads, datasets, prompts, experiments, and gateway requests.
2. **Examples**: End-to-end use cases such as banking support, SEC compliance review, lead qualification, prompt optimization, customer tracking, and multi-tenant service desk workflows.

## Gateway-First Setup

This demo routes model calls through the Respan gateway. Vercel does not need an `OPENAI_API_KEY` for the included examples.

The server routes use the OpenAI-compatible Vercel AI SDK provider with the Respan key typed into the page. Browser-driven requests must include the `x-respan-api-key` header; routes intentionally ignore `RESPAN_API_KEY` from Vercel, `.env`, or `.env.local`.

```ts
const apiKey = getRespanApiKey(req); // x-respan-api-key only
if (!apiKey) return missingUserRespanApiKeyResponse();

createOpenAI({
  apiKey,
  baseURL: getRespanGatewayBaseUrl(),
});
```

Docs: [Respan documentation overview](https://www.respan.ai/docs/documentation/overview)

## Local Setup

### Prerequisites

- Node.js 20+
- Yarn 1.x
- Respan API key from [platform.respan.ai](https://platform.respan.ai)

### Install

```bash
yarn install
```

> This project uses traditional `node_modules` for Turbopack compatibility.

### Configure Env Vars

No `.env.local` file is required for browser-driven demo requests. Enter your Respan API key in the page's API Keys panel before running examples or API tests.

You may set `RESPAN_BASE_URL=https://api.respan.ai` only when you need to point the demo at a different Respan endpoint. Do not rely on `RESPAN_API_KEY` in `.env`, `.env.local`, or Vercel environment variables for the interactive demo; route handlers ignore it.

### Run Locally

```bash
yarn dev
```

Open `http://localhost:3000` and choose an API section or example card.

## Deploy to Vercel

1. Create or link a Vercel project from this repo root.
2. Deploy the app. `OPENAI_API_KEY` is not needed for the included gateway-backed demo routes.
3. Open the deployed page and enter a Respan API key in the **API keys** panel before running examples or API tests.

The UI key is sent per request via the `x-respan-api-key` header. If the key is empty, the UI hides run controls and the server routes return `401` without calling Respan.

You may set `RESPAN_BASE_URL` in Vercel only when using a custom Respan endpoint. Do not use `RESPAN_API_KEY` as a fallback for this demo; browser-driven routes intentionally ignore it.

## Security Notes

- Never commit secrets. This repo ignores `.env*` via `.gitignore`.
- UI key inputs send secrets to your deployed server on each request. Treat them as sensitive.
- The interactive demo does not use `RESPAN_API_KEY` from server env vars as a fallback.

## Project Structure

```
app/
  api/
    respan/                  # Respan API proxy routes used by the API explorer
    banking-chatbot/         # Gateway-backed example route
    customer-tracking/       # Gateway-backed example route
    sec-compliance/          # Gateway-backed example route
    warmly-lead-qualification/
    atomicworks/
    prompt-optimizer/
  apis/                      # API explorer UI
  examples/                  # Example showcase UI
instrumentation.ts           # No-op; browser routes require x-respan-api-key
```

## Learn More

- [Respan documentation overview](https://www.respan.ai/docs/documentation/overview)
- [Vercel AI SDK telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
