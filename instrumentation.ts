import { Respan } from "@respan/respan";
import { VercelAIInstrumentor } from "@respan/instrumentation-vercel";

export async function register() {
  const respan = new Respan({
    apiKey: process.env.RESPAN_API_KEY,
    appName: "vercel-demo",
    instrumentations: [new VercelAIInstrumentor()],
  });
  await respan.initialize();
}
