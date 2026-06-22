import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "./system-prompt";
import { tools as promptOptimizerTools } from "./tools";
import { withWorkflow, propagateAttributes } from "@respan/respan";
import { getRespanApiKey, getRespanGatewayBaseUrl, missingUserRespanApiKeyResponse } from "@/lib/respan";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const userApiKey = getRespanApiKey(req);
  if (!userApiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const respan = createOpenAI({
    baseURL: getRespanGatewayBaseUrl(),
    apiKey: userApiKey,
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
          tools: promptOptimizerTools(userApiKey),
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
