import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "./system-prompt";
import { tools } from "./tools";

export const runtime = "nodejs";
export const maxDuration = 300;

function getApiKey(req: Request): string {
  const fromEnv = process.env.KEYWORDSAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromHeader = req.headers.get("x-keywordsai-api-key")?.trim();
  if (fromHeader) return fromHeader;
  throw new Error("Missing API key");
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const apiKey = getApiKey(req);

  const keywordsai = createOpenAI({
    baseURL: "https://api.keywordsai.co/api",
    apiKey,
  });

  const result = streamText({
    model: keywordsai("claude-sonnet-4-5-20250929"),
    system: SYSTEM_PROMPT,
    messages,
    tools: tools(apiKey),
    maxSteps: 10,
    toolCallStreaming: true,
  });

  return result.toDataStreamResponse();
}
