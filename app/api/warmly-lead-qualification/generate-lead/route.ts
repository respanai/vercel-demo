import OpenAI from "openai";

export async function POST(req: Request) {
  const keywordsApiKey =
    req.headers.get("x-keywordsai-api-key")?.trim() ||
    process.env.KEYWORDSAI_API_KEY;

  if (!keywordsApiKey) {
    return Response.json(
      { error: "Keywords AI API key is required." },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.KEYWORDSAI_BASE_URL || "https://api.keywordsai.co";

  const client = new OpenAI({
    apiKey: keywordsApiKey,
    baseURL: `${baseUrl}/api/`,
  });

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are a realistic B2B lead data generator for a sales intelligence platform called Warmly. Generate a single fictional but realistic lead profile. Each profile should feel like a real person at a real company.

Rules:
- Vary the lead quality: some should be hot leads (VP at funded SaaS, pricing page visits, inbound message), some mid-tier (founder browsing blog), some bad fits (generic email, no signals, unrelated industry)
- Use realistic but fictional names, companies, and email addresses
- Company names should sound like real startups/businesses (e.g. "Lattice", "Gong", "Clearbit" style naming)
- Email should match the person and company (e.g. sarah@rocketcrm.io)
- Pages viewed should be realistic website paths (e.g. /pricing, /demo, /case-studies/customer-name, /blog/topic)
- LinkedIn activity should read like real LinkedIn behavior — posts, comments, shares relevant to their role
- Inbound messages should only appear for ~30% of leads, and should feel natural
- Website visits should range from 1 to 15
- Vary industries: B2B SaaS, fintech, healthcare tech, dev tools, e-commerce, consulting, manufacturing, etc.
- Vary roles: VP Sales, SDR Manager, Head of Growth, CEO, Marketing Director, DevOps Lead, etc.
- Vary company sizes implicitly through the profile details

Respond with JSON only:
{
  "name": string,
  "email": string,
  "company": string,
  "role": string,
  "websiteVisits": number,
  "pagesViewed": string[],
  "linkedinActivity": string,
  "message": string | null
}` },
        { role: "user", content: "Generate one random lead profile." },
      ],
      temperature: 1.1,
      // @ts-expect-error - Keywords AI parameters
      customer_identifier: "warmly_demo_user",
      thread_identifier: `warmly_generate_${Date.now()}`,
      metadata: { agent: "Lead Generator", step: "generate" },
    });
    const text = response.choices[0].message.content || "";

    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json(
        { error: "Could not parse LLM response" },
        { status: 500 }
      );
    }

    const result = JSON.parse(match[0]);
    return Response.json(result);
  } catch (error) {
    console.error("Generate lead error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
