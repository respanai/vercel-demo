# Respan Vercel AI SDK Demo

A Next.js demo application showcasing Respan tracing, API workflows, and gateway-backed model calls with the Vercel AI SDK.

## What This Demo Includes

1. **APIs**: Interactive examples for Respan logs, traces, users, threads, datasets, prompts, experiments, and gateway requests.
2. **Examples**: End-to-end use cases such as banking support, SEC compliance review, lead qualification, prompt optimization, customer tracking, and multi-tenant service desk workflows.

## Gateway-First Setup

This demo routes model calls through the Respan gateway. Vercel does not need an `OPENAI_API_KEY` for the included examples.

The server routes use the OpenAI-compatible Vercel AI SDK provider with Respan credentials. Requests resolve credentials in this order: the UI-provided `x-respan-api-key` header first, then `RESPAN_API_KEY` from Vercel/`.env.local`.

```ts
const apiKey = getRespanApiKey(req); // x-respan-api-key first, then RESPAN_API_KEY

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

Create a `.env.local` file in this repo root:

```bash
# Respan gateway + tracing
RESPAN_API_KEY=your_respan_api_key_here
RESPAN_BASE_URL=https://api.respan.ai
```

`RESPAN_BASE_URL` is optional when you use `https://api.respan.ai`, but setting it explicitly keeps local and Vercel environments clear.

### Run Locally

```bash
yarn dev
```

Open `http://localhost:3000` and choose an API section or example card.

## Deploy to Vercel

### Recommended: Use Respan Gateway Env Vars

1. Create or link a Vercel project from this repo root.
2. In Vercel Project Settings -> Environment Variables, add:
   - `RESPAN_API_KEY`
   - `RESPAN_BASE_URL` set to `https://api.respan.ai` unless you use a custom Respan endpoint
3. Deploy.

Do not add `OPENAI_API_KEY` for the included gateway-backed demo routes. The routes call models through `https://api.respan.ai/api` using `RESPAN_API_KEY`.

### Optional: Paste A Key In The UI

The UI has an **API keys (optional)** panel:

- Keys are not persisted; refreshing the page clears them.
- A pasted Respan key is sent per request via the `x-respan-api-key` header and takes precedence over the server env var.
- If `RESPAN_API_KEY` is set in Vercel or `.env.local`, routes can run without a pasted UI key.

For production or shared demos, prefer Vercel env vars and keep the UI field empty unless you intentionally want to test a different key.

## Security Notes

- Never commit secrets. This repo ignores `.env*` via `.gitignore`.
- UI key inputs are convenient for demos, but they still send secrets to your deployed server. Treat them as sensitive.

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
instrumentation.ts           # Respan tracing setup
```

## Learn More

- [Respan documentation overview](https://www.respan.ai/docs/documentation/overview)
- [Vercel AI SDK telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
