import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { withTask, withTool, propagateAttributes } from "@respan/respan";
import { getClient as getTracingSdk } from "@respan/tracing/dist/utils/tracing.js";
import { getRespanGatewayBaseUrl } from "@/lib/respan";
import { getRespanApiKey, missingUserRespanApiKeyResponse } from "@/lib/respan";

export const maxDuration = 30;

// ============================================================================
// TOOL DEFINITIONS - 5 Banking Tools (Mock implementations)
// ============================================================================

type ToolParams = Record<string, unknown>;

const BANKING_TOOLS: Record<string, (params: ToolParams) => Promise<unknown>> = {
  checkAccountBalance: async (params: ToolParams) => {
    await simulateDelay(100);
    const accountId = (params.accountId as string) || "default";
    const accountType = (params.accountType as string) || "all";
    const mockBalances = {
      checking: { balance: 15420.5, available: 15420.5, pending: 0 },
      savings: { balance: 52300.0, available: 52300.0, pending: 0 },
    };
    if (accountType === "all") {
      return { accountId, balances: mockBalances, totalBalance: mockBalances.checking.balance + mockBalances.savings.balance, asOf: new Date().toISOString() };
    }
    return { accountId, accountType, ...(mockBalances[accountType as keyof typeof mockBalances] || mockBalances.checking), asOf: new Date().toISOString() };
  },

  getTransactionHistory: async (params: ToolParams) => {
    await simulateDelay(150);
    const accountId = (params.accountId as string) || "default";
    const limit = (params.limit as number) || 5;
    const transactionType = params.transactionType as string;
    const mockTransactions = [
      { id: "TXN001", date: "2026-02-05", description: "Payroll Deposit", amount: 5200.0, type: "credit" },
      { id: "TXN002", date: "2026-02-04", description: "AWS Services", amount: -342.15, type: "debit" },
      { id: "TXN003", date: "2026-02-03", description: "Office Supplies Co", amount: -89.99, type: "debit" },
      { id: "TXN004", date: "2026-02-02", description: "Client Payment - Acme", amount: 12500.0, type: "credit" },
      { id: "TXN005", date: "2026-02-01", description: "Utility Payment", amount: -215.0, type: "debit" },
    ];
    let filtered = mockTransactions;
    if (transactionType && transactionType !== "all") filtered = mockTransactions.filter((t) => t.type === transactionType);
    return { accountId, transactions: filtered.slice(0, limit), totalCount: filtered.length, period: "Last 30 days" };
  },

  wireTransferStatus: async (params: ToolParams) => {
    await simulateDelay(120);
    const referenceNumber = params.referenceNumber as string;
    const lookupType = (params.lookupType as string) || "recent";
    if (lookupType === "pending") return { pendingWires: [{ ref: "WR-2026-0042", amount: 25000.0, recipient: "Vendor Corp", status: "Processing", eta: "2026-02-06" }], totalPending: 1 };
    if (lookupType === "byReference" && referenceNumber) return { referenceNumber, amount: 15000.0, recipient: "Acme Supplies", status: "Completed", completedAt: "2026-02-04T14:32:00Z", fee: 25.0 };
    return { recentWires: [{ ref: "WR-2026-0041", amount: 15000.0, status: "Completed", date: "2026-02-04" }, { ref: "WR-2026-0040", amount: 8500.0, status: "Completed", date: "2026-02-01" }], totalCount: 2 };
  },

  createSupportTicket: async (params: ToolParams) => {
    await simulateDelay(80);
    const category = (params.category as string) || "other";
    const priority = (params.priority as string) || "medium";
    const subject = (params.subject as string) || "Support request";
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;
    return { ticketId, category, priority, subject, status: "Open", createdAt: new Date().toISOString(), estimatedResponse: priority === "urgent" ? "1 hour" : priority === "high" ? "4 hours" : "24 hours", message: `Your support ticket ${ticketId} has been created.` };
  },

  getAccountInfo: async (params: ToolParams) => {
    await simulateDelay(90);
    const infoType = (params.infoType as string) || "basic";
    const basic = { accountName: "Rho Business Account", accountNumber: "****4521", routingNumber: "****0892", accountType: "Business Checking", status: "Active" };
    if (infoType === "basic") return basic;
    if (infoType === "settings") return { ...basic, notifications: { email: true, sms: true, push: true }, twoFactorEnabled: true, dailyTransferLimit: 100000, monthlyWireLimit: 500000 };
    return { ...basic, openedDate: "2024-03-15", primaryContact: "finance@company.com", authorizedUsers: 3, linkedAccounts: 2, lastActivity: new Date().toISOString() };
  },
};


function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WORKFLOW_NAME = "banking-chatbot";
const TRACE_GROUP_IDENTIFIER = "banking-chatbot-workflow";
const CUSTOMER_IDENTIFIER = "banking_demo_user";
const TRACER = trace.getTracer(WORKFLOW_NAME);

const LOG_TYPE_ATTR = "respan.entity.log_type";
const ENTITY_INPUT_ATTR = "traceloop.entity.input";
const ENTITY_OUTPUT_ATTR = "traceloop.entity.output";
const SPAN_KIND_ATTR = "traceloop.span.kind";
const WORKFLOW_NAME_ATTR = "traceloop.workflow.name";
const ENTITY_NAME_ATTR = "traceloop.entity.name";
const ENTITY_PATH_ATTR = "traceloop.entity.path";
const CUSTOMER_ID_ATTR = "respan.customer_params.customer_identifier";
const CUSTOMER_NAME_ATTR = "respan.customer_params.name";
const THREAD_ID_ATTR = "respan.threads.thread_identifier";
const SESSION_ID_ATTR = "respan.sessions.session_identifier";
const TRACE_GROUP_ATTR = "respan.trace.trace_group_identifier";
const METADATA_WORKFLOW_ATTR = "respan.metadata.workflow";
const METADATA_MESSAGE_ATTR = "respan.metadata.message";

async function flushTracingWithoutShutdown() {
  try {
    const sdk = getTracingSdk() as
      | {
          _tracerProvider?: {
            forceFlush?: () => Promise<void>;
            activeSpanProcessor?: { forceFlush?: () => Promise<void> };
          };
        }
      | undefined;

    if (typeof sdk?._tracerProvider?.forceFlush === "function") {
      await sdk._tracerProvider.forceFlush();
      return;
    }

    if (typeof sdk?._tracerProvider?.activeSpanProcessor?.forceFlush === "function") {
      await sdk._tracerProvider.activeSpanProcessor.forceFlush();
      return;
    }

    const provider = trace.getTracerProvider() as {
      forceFlush?: () => Promise<void>;
      _delegate?: { forceFlush?: () => Promise<void> };
      getDelegate?: () => { forceFlush?: () => Promise<void> };
    };
    const delegate = provider?._delegate ?? provider?.getDelegate?.() ?? provider;
    await delegate?.forceFlush?.();
  } catch {
    // Best effort: do not fail the request because telemetry could not flush.
  }
}

async function withBankingWorkflowRoot<T>(
  params: { threadId: string; message: string },
  fn: () => Promise<T>
): Promise<T> {
  const { threadId, message } = params;

  return TRACER.startActiveSpan(`${WORKFLOW_NAME}.workflow`, async (span) => {
    span.setAttribute(LOG_TYPE_ATTR, "workflow");
    span.setAttribute(SPAN_KIND_ATTR, "workflow");
    span.setAttribute(WORKFLOW_NAME_ATTR, WORKFLOW_NAME);
    span.setAttribute(ENTITY_NAME_ATTR, WORKFLOW_NAME);
    span.setAttribute(ENTITY_PATH_ATTR, "");
    span.setAttribute(CUSTOMER_ID_ATTR, CUSTOMER_IDENTIFIER);
    span.setAttribute(CUSTOMER_NAME_ATTR, "Rho Banking Demo");
    span.setAttribute(THREAD_ID_ATTR, threadId);
    span.setAttribute(SESSION_ID_ATTR, threadId);
    span.setAttribute(TRACE_GROUP_ATTR, TRACE_GROUP_IDENTIFIER);
    span.setAttribute(METADATA_WORKFLOW_ATTR, WORKFLOW_NAME);
    span.setAttribute(METADATA_MESSAGE_ATTR, message);
    span.setAttribute(ENTITY_INPUT_ATTR, JSON.stringify({ message, thread_id: threadId }));

    try {
      const result = await fn();
      span.setAttribute(
        ENTITY_OUTPUT_ATTR,
        JSON.stringify({ status: "completed", workflow: WORKFLOW_NAME, thread_id: threadId })
      );
      return result;
    } catch (err) {
      if (err instanceof Error) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

function getTelemetryMetadata(threadId: string, agent: string) {
  return {
    customer_identifier: CUSTOMER_IDENTIFIER,
    thread_identifier: threadId,
    session_identifier: threadId,
    trace_group_identifier: TRACE_GROUP_IDENTIFIER,
    customer_params: JSON.stringify({
      customer_identifier: CUSTOMER_IDENTIFIER,
      name: "Rho Banking Demo",
    }),
    workflow: WORKFLOW_NAME,
    agent,
  };
}

// ============================================================================
// PROMPT TEMPLATE
// ============================================================================

const TOOL_SELECTION_SYSTEM_PROMPT = `You are a banking assistant tool router. Your job is to analyze user messages and determine which banking tool to use.

Available tools:
1. checkAccountBalance - Check account balance. Use for: balance inquiries, "how much money", "funds available"
2. getTransactionHistory - Get recent transactions. Use for: "recent transactions", "spending", "payment history"
3. wireTransferStatus - Check wire transfer status. Use for: "wire status", "transfer status", "pending transfers"
4. createSupportTicket - Create support ticket. Use for: problems, complaints, issues needing human help
5. getAccountInfo - Get account details. Use for: "account info", "account settings", "profile"

Respond with a JSON object:
{
  "tool": "toolName or 'none' if no tool needed",
  "parameters": { ... tool-specific parameters ... },
  "reasoning": "Brief explanation of why this tool was selected"
}

Parameter schemas:
- checkAccountBalance: { accountId: "default", accountType: "checking"|"savings"|"all" }
- getTransactionHistory: { accountId: "default", limit: 5-50, transactionType?: "all"|"debit"|"credit" }
- wireTransferStatus: { referenceNumber?: "string", lookupType: "recent"|"byReference"|"pending" }
- createSupportTicket: { category: "account"|"transaction"|"wire"|"technical"|"other", priority: "low"|"medium"|"high"|"urgent", subject: "string", description: "string" }
- getAccountInfo: { infoType: "basic"|"detailed"|"settings" }`;

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(req: Request) {
  const { message, promptId } = await req.json();
  const userMessage = typeof message === "string" ? message.trim() : "";
  const steps: Array<{ agent: string; action: string; output: string; toolName?: string }> = [];

  if (!userMessage) {
    return Response.json({ error: "Message is required.", steps }, { status: 400 });
  }

  const apiKey = getRespanApiKey(req);

  if (!apiKey) {
    return missingUserRespanApiKeyResponse();
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: getRespanGatewayBaseUrl(),
  });

  const threadId = `banking_thread_${Date.now()}`;

  try {
    const result = await propagateAttributes(
      {
        customer_identifier: CUSTOMER_IDENTIFIER,
        thread_identifier: threadId,
        session_identifier: threadId,
        trace_group_identifier: TRACE_GROUP_IDENTIFIER,
        metadata: {
          workflow: WORKFLOW_NAME,
          trace_group_identifier: TRACE_GROUP_IDENTIFIER,
          thread_id: threadId,
        },
      },
      () =>
        withBankingWorkflowRoot({ threadId, message: userMessage }, async () => {
          // ====================================================================
          // STEP 1: Tool Selection
          // ====================================================================
          const toolSelectionResult = await withTask(
            { name: "tool_selection" },
            async () =>
              generateText({
                model: provider("gpt-4o-mini"),
                system: TOOL_SELECTION_SYSTEM_PROMPT,
                prompt: `User message: "${userMessage}"\n\nAnalyze this message and determine which banking tool(s) to use. Return a JSON response.`,
                experimental_telemetry: {
                  isEnabled: true,
                  functionId: "banking-tool-selection",
                  metadata: {
                    ...getTelemetryMetadata(threadId, "Tool Selection Agent"),
                  },
                },
              })
          );

          let toolSelection: { tool: string; parameters: Record<string, unknown>; reasoning: string };
          try {
            const jsonMatch = toolSelectionResult.text.match(/\{[\s\S]*\}/);
            toolSelection = jsonMatch
              ? JSON.parse(jsonMatch[0])
              : { tool: "none", parameters: {}, reasoning: "Could not parse response" };
          } catch {
            toolSelection = { tool: "none", parameters: {}, reasoning: toolSelectionResult.text };
          }

          steps.push({
            agent: "Tool Selection Agent",
            action: "Analyzing user intent and selecting appropriate tool...",
            output: JSON.stringify(toolSelection, null, 2),
          });

          // ====================================================================
          // STEP 2: Execute the selected tool
          // ====================================================================
          let toolResult: unknown = null;
          const selectedToolName = toolSelection.tool;
          const isValidTool = selectedToolName && selectedToolName !== "none" && selectedToolName in BANKING_TOOLS;

          if (isValidTool) {
            toolResult = await withTool(
              { name: selectedToolName },
              async () => {
                const toolFn = BANKING_TOOLS[selectedToolName];
                return toolFn(toolSelection.parameters || {});
              }
            );
            steps.push({ agent: "Tool Executor", action: `Executing ${selectedToolName}...`, output: JSON.stringify(toolResult, null, 2), toolName: selectedToolName });
          } else {
            steps.push({ agent: "Tool Executor", action: "No tool selected - using general response", output: "No specific banking tool was needed for this query." });
          }

          // ====================================================================
          // STEP 3: Generate final response
          // ====================================================================
          const finalResult = await withTask(
            { name: "response_generation" },
            async () =>
              generateText({
                model: provider("gpt-4o-mini"),
                system: `You are a helpful internal banking assistant for Rho. Summarize the tool results in a clear, helpful way.`,
                prompt: `User question: "${userMessage}"\n\nTool used: ${selectedToolName || "none"}\nTool result: ${JSON.stringify(toolResult, null, 2)}\n\nProvide a helpful, professional response.`,
                experimental_telemetry: {
                  isEnabled: true,
                  functionId: "banking-response-generation",
                  metadata: {
                    ...getTelemetryMetadata(threadId, "Response Generator"),
                  },
                },
              })
          );

          steps.push({ agent: "Response Generator", action: "Generating final response...", output: finalResult.text });

          return {
            response: finalResult.text,
            steps,
            toolUsed: isValidTool ? selectedToolName : "none",
            toolResult,
            metadata: {
              workflow: WORKFLOW_NAME,
              promptId: typeof promptId === "string" && promptId.trim() ? promptId.trim() : null,
              traceGroup: TRACE_GROUP_IDENTIFIER,
              threadId,
            },
          };
        })
    );

    return Response.json(result);
  } catch (error) {
    console.error("Banking chatbot error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error", steps }, { status: 500 });
  } finally {
    await flushTracingWithoutShutdown();
  }
}
