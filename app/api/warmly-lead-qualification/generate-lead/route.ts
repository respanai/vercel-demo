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
      model: "gpt-5.2",
      messages: [
        { role: "system", content: `You are a realistic B2B lead data generator for a sales intelligence platform called Warmly. Generate a single fictional but realistic lead profile. Each profile should feel like a real person — or sometimes NOT a real person at all.

IMPORTANT: The distribution should be heavily weighted toward BAD and TRICKY leads to stress-test our qualification pipeline:
- ~20% hot leads (VP at funded SaaS, pricing page visits, inbound message)
- ~45% bad leads (see categories below)
- ~35% tricky/edge-case leads (see categories below)

BAD LEAD categories (pick randomly):
- Personal/throwaway emails: gmail.com, yahoo.com, hotmail.com, outlook.com addresses with no company association
- Bots/crawlers: names like "Test User", "Admin", "Webmaster", nonsensical names, or auto-generated usernames
- Competitors: people from competing sales intelligence companies (e.g. ZoomInfo, Apollo, 6sense, Outreach)
- Students/academics: .edu emails, "Intern", "Research Assistant", university names as company
- Completely unrelated industries: local restaurants, plumbers, dentists, pet stores, yoga studios
- Spam/fake: gibberish emails (asdf123@test.com), empty or suspicious company names, roles like "CEO" at a one-person "company"
- Job seekers: people who are clearly looking for jobs, not buying software (messages about "looking for opportunities")
- Free-tier abusers: lots of visits but only to /pricing and /free-trial, no real engagement signals

TRICKY LEAD categories (harder to classify correctly):
- Looks good but isn't: VP title at a real-sounding company but with a generic email, or great role but in a tiny non-tech company
- Looks bad but is actually good: CEO with a gmail address but the company is a well-funded startup, or someone with few page views but a very high-intent inbound message
- Ambiguous intent: visited /pricing AND /careers (are they buying or job hunting?), or browsed /case-studies but the message asks about partnerships not purchasing
- Mixed signals: senior role at a good company but LinkedIn activity is all about leaving their current job, or great engagement but the company is in a non-ICP industry
- Edge case roles: "Advisor", "Board Member", "Fractional CTO", "Consultant" — not clearly a buyer
- International leads: companies from regions that may or may not be in the target market, with non-English names
- Duplicate-like: very similar names/emails to common test data (e.g. "John Smith" at "Acme Corp")

General rules:
- Use realistic but fictional names, companies, and email addresses
- Company names should sound real (both good companies like "Lattice" style and bad ones like "Jim's Auto Body")
- Email should match the person and company
- Pages viewed should be realistic website paths
- LinkedIn activity should read like real LinkedIn behavior
- Inbound messages should appear for ~30% of leads
- Website visits should range from 0 to 20 (yes, 0 is valid for some bad leads)
- Vary everything: industries, roles, company sizes, geographies

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
