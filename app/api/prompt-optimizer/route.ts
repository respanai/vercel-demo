import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "./system-prompt";
import { tools } from "./tools";
import { withWorkflow, propagateAttributes } from "@respan/respan";

export const runtime = "nodejs";
export const maxDuration = 300;

function getApiKey(req: Request): string {
  const fromEnv = process.env.RESPAN_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromHeader = req.headers.get("x-respan-api-key")?.trim();
  if (fromHeader) return fromHeader;
  throw new Error("Missing API key");
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const apiKey = getApiKey(req);

  const respan = createOpenAI({
    baseURL: "https://api.respan.ai/api",
    apiKey,
  });

  const threadId = `prompt_opt_${Date.now()}`;

  return propagateAttributes(
    {
      customer_identifier: "prompt_optimizer_user",
      thread_identifier: threadId,
      trace_group_identifier: "prompt_optimization",
    },
    () =>
      withWorkflow({ name: "prompt_optimization" }, () => {
        const result = streamText({
          model: respan("claude-sonnet-4-5-20250929"),
          system: SYSTEM_PROMPT,
          messages,
          tools: tools(apiKey),
          maxSteps: 10,
          toolCallStreaming: true,
          experimental_telemetry: {
            isEnabled: true,
            metadata: {
              customer_identifier: "prompt_optimizer_user",
              thread_identifier: threadId,
              workflow: "prompt-optimization",
            },
          },
        });

        return result.toDataStreamResponse();
      })
  );
}
