"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ============================================================================
// TYPES
// ============================================================================

interface ComplianceFinding {
  id: number;
  category: string;
  severity: "critical" | "moderate" | "minor";
  flagged_text: string;
  rule_reference: string;
  explanation: string;
  suggestion: string;
}

interface ComplianceResult {
  overall_status: "compliant" | "issues_found";
  summary: string;
  findings: ComplianceFinding[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EXAMPLES: { label: string; content: string }[] = [
  {
    label: "Clean \u2014 General Marketing",
    content: `At Greenfield Wealth Advisors, we help clients navigate complex financial landscapes. Our team of advisors brings over 50 years of combined experience in wealth management. Schedule a free consultation to learn how we can help you plan for retirement.

We offer personalized financial planning, portfolio management, and tax-efficient investment strategies. Our offices are located in Denver and Austin.`,
  },
  {
    label: "Missing Testimonial Disclosure",
    content: `After working with Greenfield for just six months, I saw my portfolio grow significantly. Their team truly understands my financial goals and I couldn't be happier with the personalized attention I receive. \u2014 Sarah M., Client since 2022

"Greenfield changed my family's financial future. Their advisors are top-notch and always available when I have questions." \u2014 James T.`,
  },
  {
    label: "Hypothetical Performance \u2014 Retail",
    content: `Our AI-powered model portfolio has been backtested to show a 14.2% annual return over the last 10 years, consistently outperforming the S&P 500 by over 300 basis points.

See how smart investing can work for you \u2014 open an account today with as little as $500. Our proprietary algorithm identifies opportunities that traditional advisors miss.`,
  },
  {
    label: "Subtle Omission & Cherry-Picking",
    content: `Greenfield Wealth Advisors ranked #1 in client satisfaction among independent advisors in the Rocky Mountain region for 2024.

Our Growth Fund returned 22.3% last year. With results like these, there's never been a better time to invest with us. Contact our team today to get started.`,
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  "General Prohibitions": "\u26a0\ufe0f",
  "Testimonials & Endorsements": "\ud83d\udcac",
  "Performance Advertising": "\ud83d\udcca",
  "Third-Party Ratings": "\u2b50",
  Substantiation: "\ud83d\udccb",
};

const SEVERITY_STYLES: Record<
  string,
  { badge: string; card: string; highlight: string; highlightHover: string }
> = {
  critical: {
    badge: "bg-red-700 text-white",
    card: "border-red-200 bg-red-50",
    highlight: "bg-red-100",
    highlightHover: "bg-red-200",
  },
  moderate: {
    badge: "bg-amber-600 text-white",
    card: "border-amber-200 bg-amber-50",
    highlight: "bg-amber-100",
    highlightHover: "bg-amber-200",
  },
  minor: {
    badge: "bg-blue-600 text-white",
    card: "border-blue-200 bg-blue-50",
    highlight: "bg-blue-100",
    highlightHover: "bg-blue-200",
  },
};

// ============================================================================
// HIGHLIGHTING LOGIC
// ============================================================================

interface TextSegment {
  text: string;
  findingId: number | null;
  severity: string | null;
}

function buildSegments(
  text: string,
  findings: ComplianceFinding[]
): TextSegment[] {
  // Find spans for each finding via indexOf
  const spans: { start: number; end: number; findingId: number; severity: string }[] = [];
  for (const f of findings) {
    if (!f.flagged_text) continue;
    const idx = text.indexOf(f.flagged_text);
    if (idx === -1) continue;
    spans.push({ start: idx, end: idx + f.flagged_text.length, findingId: f.id, severity: f.severity });
  }

  // Sort by start position
  spans.sort((a, b) => a.start - b.start);

  // Remove overlaps: keep first occurrence
  const nonOverlapping: typeof spans = [];
  let lastEnd = 0;
  for (const span of spans) {
    if (span.start >= lastEnd) {
      nonOverlapping.push(span);
      lastEnd = span.end;
    }
  }

  // Build segments
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const span of nonOverlapping) {
    if (span.start > cursor) {
      segments.push({ text: text.slice(cursor, span.start), findingId: null, severity: null });
    }
    segments.push({
      text: text.slice(span.start, span.end),
      findingId: span.findingId,
      severity: span.severity,
    });
    cursor = span.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), findingId: null, severity: null });
  }

  return segments;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SecComplianceSection(props: { respanApiKey: string }) {
  const { respanApiKey } = props;

  const [content, setContent] = useState("");
  const [reviewedContent, setReviewedContent] = useState("");
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFindingId, setHoveredFindingId] = useState<number | null>(null);

  const runReview = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setReviewedContent(content);
    try {
      const res = await fetch("/api/sec-compliance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(respanApiKey && { "x-respan-api-key": respanApiKey }),
        },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const segments = result && result.findings.length > 0
    ? buildSegments(reviewedContent, result.findings)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold">SEC Marketing Rule Compliance Review</h2>
        <p className="text-xs text-gray-600 mt-1">
          Paste marketing content below. AI reviews it against SEC Rule 206(4)-1
          and flags potential violations with inline highlighting.
        </p>
      </div>

      {/* Example Selector */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            className="text-[10px] px-2 py-1 border border-gray-200 hover:border-black transition-colors"
            onClick={() => {
              setContent(ex.content);
              setResult(null);
              setError(null);
            }}
            disabled={loading}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Textarea */}
      <Textarea
        className="min-h-[200px]"
        placeholder="Paste marketing content to review..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={loading}
      />

      {/* Submit */}
      <Button
        variant="primary"
        className="w-full py-3"
        onClick={runReview}
        disabled={loading || !content.trim()}
      >
        {loading ? "Reviewing..." : "Run Compliance Review"}
      </Button>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700 font-mono">{error}</p>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Status Bar */}
          <Card
            className={`p-4 ${
              result.overall_status === "compliant"
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {result.overall_status === "compliant" ? "\u2705" : "\u26a0\ufe0f"}
              </span>
              <span
                className={`text-xs font-bold ${
                  result.overall_status === "compliant"
                    ? "text-green-700"
                    : "text-amber-700"
                }`}
              >
                {result.overall_status === "compliant"
                  ? "Compliant"
                  : `${result.findings.length} issue${result.findings.length !== 1 ? "s" : ""} found`}
              </span>
            </div>
            <p className="text-xs text-gray-700 mt-1">{result.summary}</p>
          </Card>

          {/* Annotated Content */}
          {segments && (
            <div>
              <Label className="mb-2 block">Annotated Content</Label>
              <Card className="p-4">
                <div className="text-xs leading-relaxed whitespace-pre-wrap">
                  {segments.map((seg, i) => {
                    if (seg.findingId === null) {
                      return <span key={i}>{seg.text}</span>;
                    }
                    const styles = SEVERITY_STYLES[seg.severity || "minor"];
                    const isHovered = hoveredFindingId === seg.findingId;
                    return (
                      <span
                        key={i}
                        className={`${
                          isHovered ? styles.highlightHover + " underline" : styles.highlight
                        } transition-colors cursor-pointer`}
                        onMouseEnter={() => setHoveredFindingId(seg.findingId)}
                        onMouseLeave={() => setHoveredFindingId(null)}
                      >
                        {seg.text}
                      </span>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* Finding Cards */}
          {result.findings.length > 0 && (
            <div>
              <Label className="mb-3 block">
                Findings ({result.findings.length})
              </Label>
              <div className="space-y-4">
                {result.findings.map((f) => {
                  const styles = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.minor;
                  const icon = CATEGORY_ICONS[f.category] || "\u26a0\ufe0f";
                  const isHovered = hoveredFindingId === f.id;
                  return (
                    <Card
                      key={f.id}
                      className={`p-4 ${styles.card} transition-all ${
                        isHovered ? "ring-2 ring-black shadow-md" : ""
                      }`}
                      onMouseEnter={() => setHoveredFindingId(f.id)}
                      onMouseLeave={() => setHoveredFindingId(null)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span>{icon}</span>
                        <span className="text-xs font-bold">{f.category}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 font-mono ${styles.badge}`}
                        >
                          {f.severity}
                        </span>
                        <span className="text-[10px] text-gray-500 ml-auto">
                          {f.rule_reference}
                        </span>
                      </div>

                      <Card variant="muted" className="p-3 mb-2">
                        <p className="text-[10px] font-mono italic">
                          &ldquo;{f.flagged_text}&rdquo;
                        </p>
                      </Card>

                      <p className="text-xs text-gray-700 mb-2">{f.explanation}</p>

                      <div className="text-xs">
                        <span className="font-bold">Suggestion: </span>
                        <span className="text-gray-600">{f.suggestion}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
