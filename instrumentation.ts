let initialized = false;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (initialized) return;
  initialized = true;

  const [{ startTracing }, { VercelAIInstrumentor }, tracing] = await Promise.all([
    import("@respan/tracing/dist/utils/tracing.js"),
    import("@respan/instrumentation-vercel"),
    import("./lib/requestScopedRespanTracing"),
  ]);

  await startTracing({
    apiKey: "request-scoped-key",
    appName: "vercel-demo",
    disabledInstrumentations: [
      "openAI",
      "anthropic",
      "azureOpenAI",
      "cohere",
      "bedrock",
      "googleVertexAI",
      "googleAIPlatform",
      "pinecone",
      "together",
      "langChain",
      "llamaIndex",
      "chromaDB",
      "qdrant",
    ],
    exporter: new tracing.RequestScopedRespanOtlpExporter(),
    spanNameStyle: "semantic",
    silenceInitializationMessage: true,
    spanPostprocessCallback: tracing.attachRequestRespanApiKey,
  });

  new VercelAIInstrumentor().activate();
}
