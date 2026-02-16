export const maxDuration = 30;

// ============================================================================
// KEYWORDS AI GATEWAY HELPER
// ============================================================================

async function callKeywordsAIGateway(
  apiKey: string,
  promptId: string,
  variables: Record<string, string>,
  metadata: Record<string, string>
): Promise<string> {
  const baseUrl = process.env.KEYWORDSAI_BASE_URL || "https://api.keywordsai.co";

  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Data-Keywordsai-Params": Buffer.from(JSON.stringify(metadata)).toString("base64"),
    },
    body: JSON.stringify({
      prompt: {
        prompt_id: promptId,
        variables,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Keywords AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

const PROMPT_ID = "521b57644216457f86c66ecbeba4a9da";

export async function POST(req: Request) {
  const { content } = await req.json();

  const keywordsApiKey =
    req.headers.get("x-keywordsai-api-key")?.trim() || process.env.KEYWORDSAI_API_KEY;

  if (!keywordsApiKey) {
    return Response.json(
      { error: "Keywords AI API key is required. Set KEYWORDSAI_API_KEY or pass via header." },
      { status: 400 }
    );
  }

  // Set runtime key for OTEL exporter
  (globalThis as any).__KEYWORDSAI_RUNTIME_API_KEY__ = keywordsApiKey;

  const traceMetadata = {
    customer_identifier: "sec_compliance_demo_user",
    trace_group_identifier: "sec_compliance_workflow",
    thread_identifier: `sec_thread_${Date.now()}`,
  };

  try {
    const responseText = await callKeywordsAIGateway(
      keywordsApiKey,
      PROMPT_ID,
      { content },
      { ...traceMetadata, step: "compliance_review", agent: "SEC Compliance Reviewer" }
    );

    // Strip markdown fences and parse JSON
    let cleaned = responseText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse compliance review response as JSON");
    }

    const result = JSON.parse(jsonMatch[0]);

    return Response.json({
      result,
      metadata: {
        workflow: "sec-compliance",
        traceGroup: "sec_compliance_workflow",
        promptId: PROMPT_ID,
      },
    });
  } catch (error) {
    console.error("SEC compliance review error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
