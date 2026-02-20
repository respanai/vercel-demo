import OpenAI from "openai";
import { KeywordsAITelemetry } from "@keywordsai/tracing";

export async function register() {
  const apiKey = process.env.KEYWORDSAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[KeywordsAI] No KEYWORDSAI_API_KEY set — tracing will not be initialized."
    );
    return;
  }

  const telemetry = new KeywordsAITelemetry({
    apiKey,
    baseURL:
      process.env.KEYWORDSAI_BASE_URL || "https://api.keywordsai.co",
    appName: "warmly-lead-qualification",
    disableBatch: true,
    instrumentModules: { openAI: OpenAI },
  });

  await telemetry.initialize();
  console.log("[KeywordsAI] Tracing initialized in instrumentation hook.");
}
