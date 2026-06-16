import { Respan } from "@respan/respan";
import { VercelAIInstrumentor } from "@respan/instrumentation-vercel";

export async function register() {
  const respan = new Respan({
    apiKey: process.env.RESPAN_API_KEY,
    appName: "vercel-demo",
    instrumentations: [new VercelAIInstrumentor()],
  });
  await respan.initialize();
  // Stash the client so request handlers can force-flush spans before the
  // serverless function suspends (batched spans are otherwise lost on Vercel).
  (globalThis as typeof globalThis & { __respan?: Respan }).__respan = respan;
}
