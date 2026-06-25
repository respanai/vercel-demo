import { tool } from "ai";
import { z } from "zod";
import {
  callRespan,
  callGateway,
  extractJSON,
  computeParetoFrontier,
  type ParetoEntry,
} from "./respan-api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type PromptMessage = { role: string; content: string };

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => contentToText(part)).join("");
  }
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (Array.isArray(record.content)) return contentToText(record.content);
  }
  return String(content ?? "");
}

function normalizeMessages(messages: unknown): PromptMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages.map((message) => {
    const record = message as Record<string, unknown>;
    return {
      role: String(record.role ?? "user"),
      content: contentToText(record.content),
    };
  });
}

function extractVariables(messages: PromptMessage[]): string[] {
  const allContent = messages.map((m) => m.content).join(" ");
  const variableMatches = allContent.match(/\{\{([\w.-]+)\}\}/g) ?? [];
  return [
    ...new Set(variableMatches.map((m) => m.replace(/\{\{|\}\}/g, ""))),
  ];
}

function promptVersionsFromResponse(response: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(response)) return response as Array<Record<string, unknown>>;
  const results = (response as { results?: unknown })?.results;
  return Array.isArray(results) ? (results as Array<Record<string, unknown>>) : [];
}

async function getPromptVersions(
  apiKey: string,
  promptId: string,
): Promise<Array<Record<string, unknown>>> {
  const versionsRes = await callRespan(
    apiKey,
    "GET",
    "/api/prompts/" + promptId + "/versions/",
  );
  return promptVersionsFromResponse(versionsRes);
}

function getVersionNumber(version: Record<string, unknown>): number {
  return Number(version.version ?? version.version_number ?? 1);
}

function getPreferredPromptVersion(
  promptData: Record<string, unknown>,
  versions: Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  return (
    versions.find((v) => Boolean(v.is_deployed || v.is_active)) ??
    ((promptData.current_version && typeof promptData.current_version === "object")
      ? (promptData.current_version as Record<string, unknown>)
      : undefined) ??
    versions[0]
  );
}

async function ensurePromptVersionDeployed(
  apiKey: string,
  promptId: string,
): Promise<number> {
  const promptData = (await callRespan(
    apiKey,
    "GET",
    "/api/prompts/" + promptId + "/",
  )) as Record<string, unknown>;
  const versions = await getPromptVersions(apiKey, promptId);
  const target = getPreferredPromptVersion(promptData, versions);

  if (!target) throw new Error("No version found for this prompt");

  const versionNum = getVersionNumber(target);
  const messages = normalizeMessages(target.messages);
  const model = String(target.model ?? "gpt-4o-mini");
  return deployVersion(apiKey, promptId, versionNum, messages, model);
}

// ---------------------------------------------------------------------------
// Helper: extract output text from various response shapes
// ---------------------------------------------------------------------------

function extractOutputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const choiceContent = (o as any)?.choices?.[0]?.message?.content;
    if (choiceContent) return String(choiceContent);
    if (typeof (o as any)?.content === "string") return (o as any).content;
    if (typeof (o as any)?.message?.content === "string")
      return (o as any).message.content;
    return JSON.stringify(output);
  }
  return String(output ?? "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function renderTemplate(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = input[key];
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function inputToUserText(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 1) return String(entries[0][1] ?? "");
  return JSON.stringify(input);
}

function renderPromptMessages(
  messages: PromptMessage[],
  input: Record<string, unknown>,
): PromptMessage[] {
  let hasUserContent = false;
  const rendered = messages.map((message) => {
    const content = renderTemplate(message.content, input).trim();
    if (message.role !== "system" && content) hasUserContent = true;
    return { ...message, content };
  });

  if (!hasUserContent) {
    const firstUser = rendered.find((message) => message.role !== "system");
    if (firstUser) {
      firstUser.content = inputToUserText(input);
    } else {
      rendered.push({ role: "user", content: inputToUserText(input) });
    }
  }

  return rendered.filter((message) => message.role === "system" || message.content.trim());
}

function normalizeGatewayModel(model: unknown): string {
  const raw = String(model ?? "").trim();
  if (!raw || raw === "None" || raw === "unknown-model") return "gpt-4o-mini";
  return raw;
}

function extractUsage(raw: unknown): {
  cost: number;
  latency: number;
  promptTokens: number;
  completionTokens: number;
} {
  const record = asRecord(raw);
  const usage = asRecord(record.usage);
  const promptTokens = Number(
    usage.prompt_tokens ?? usage.promptTokens ?? record.prompt_tokens ?? 0,
  ) || 0;
  const completionTokens = Number(
    usage.completion_tokens ?? usage.completionTokens ?? record.completion_tokens ?? 0,
  ) || 0;
  return {
    cost: Number(record.cost ?? usage.cost ?? 0) || 0,
    latency: Number(record.latency ?? 0) || 0,
    promptTokens,
    completionTokens,
  };
}

function extractScore(text: string): number {
  try {
    const parsed = JSON.parse(extractJSON(text)) as Record<string, unknown>;
    const raw = parsed.score ?? parsed.value ?? parsed.numerical_value ?? parsed.primary_score;
    return Math.min(10, Math.max(0, Number(raw) || 0));
  } catch {
    const match = text.match(/(?:score|rating)?\s*:?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
    return Math.min(10, Math.max(0, Number(match?.[1]) || 0));
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function getDatasetLogs(
  apiKey: string,
  datasetId: string,
): Promise<Array<Record<string, unknown>>> {
  const logsRes = (await callRespan(
    apiKey,
    "POST",
    "/api/datasets/" + datasetId + "/logs/list/",
    { page: 1, page_size: 100 },
  )) as { results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;

  return Array.isArray(logsRes) ? logsRes : logsRes.results ?? [];
}

async function getEvaluatorDetails(
  apiKey: string,
  evaluatorWorkflowIds: string[],
): Promise<Array<{ id: string; name: string; definition: string; rubric: string }>> {
  return Promise.all(
    evaluatorWorkflowIds.map(async (id) => {
      try {
        const workflow = (await callRespan(
          apiKey,
          "GET",
          "/api/workflows/" + id + "/",
        )) as Record<string, unknown>;
        const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
        const evalTask = tasks.find((task) => asRecord(task).type === "eval");
        const config = asRecord(asRecord(evalTask).config);
        const llmConfig = asRecord(config.llm_config);
        return {
          id,
          name: String(config.name ?? workflow.name ?? id).replace(/^Optimizer\s*-\s*/i, ""),
          definition: String(llmConfig.evaluator_definition ?? workflow.description ?? id),
          rubric: String(llmConfig.scoring_rubric ?? "0=poor, 5=acceptable, 10=excellent"),
        };
      } catch {
        return {
          id,
          name: id,
          definition: "Evaluate whether the output is high quality for this metric.",
          rubric: "0=poor, 5=acceptable, 10=excellent",
        };
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Tools factory — closures over API key
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deploy helper — handles the readonly requirement for PATCH deploy
// ---------------------------------------------------------------------------

async function deployVersion(
  apiKey: string,
  promptId: string,
  versionNum: number,
  messages: PromptMessage[],
  model: string,
): Promise<number> {
  const versions = await getPromptVersions(apiKey, promptId);
  const target = versions.find((v) => getVersionNumber(v) === versionNum);

  if (target?.is_deployed || target?.is_active) return versionNum;

  if (target && target.readonly !== true) {
    await callRespan(apiKey, "POST", "/api/prompts/" + promptId + "/versions/", {
      messages,
      model,
    });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await callRespan(
        apiKey,
        "PATCH",
        "/api/prompts/" + promptId + "/versions/" + versionNum + "/",
        { deploy: true },
      );
      return versionNum;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 2 && message.toLowerCase().includes("draft")) {
        await sleep(1000);
        continue;
      }
      throw error;
    }
  }

  return versionNum;
}

export function tools(apiKey: string) {
  return {
    // -------------------------------------------------------------------
    // 1. fetch_prompt
    // -------------------------------------------------------------------
    fetch_prompt: tool({
      description:
        "Fetch an existing prompt from Respan, including its current version, messages, and variables.",
      parameters: z.object({
        prompt_id: z.string().describe("The prompt ID to fetch"),
      }),
      execute: async ({ prompt_id }) => {
        const promptData = (await callRespan(
          apiKey,
          "GET",
          "/api/prompts/" + prompt_id + "/",
        )) as Record<string, unknown>;

        const versions = await getPromptVersions(apiKey, prompt_id);
        const targetVersion = getPreferredPromptVersion(promptData, versions);
        if (!targetVersion)
          throw new Error("No version found for this prompt");

        const messages = normalizeMessages(targetVersion.messages);
        const version = getVersionNumber(targetVersion);
        const variables = extractVariables(messages);

        return {
          prompt_id,
          name: String(promptData.name ?? prompt_id),
          messages,
          variables,
          current_version: version,
          deployed_version: Boolean(targetVersion.is_deployed || targetVersion.is_active) ? version : null,
          version,
          is_deployed: Boolean(targetVersion.is_deployed || targetVersion.is_active),
          version_count: versions.length || Number(promptData.version_count ?? 1),
          model: String(targetVersion.model ?? "gpt-4o-mini"),
        };
      },
    }),

    // -------------------------------------------------------------------
    // 2. create_prompt
    // -------------------------------------------------------------------
    create_prompt: tool({
      description:
        "Create a new prompt in Respan with a system prompt and optional user template.",
      parameters: z.object({
        name: z.string().describe("Name for the prompt"),
        system_prompt: z.string().describe("The system prompt content"),
        user_template: z
          .string()
          .optional()
          .describe(
            'Optional user message template with {{variables}}, e.g. "Translate: {{text}}"',
          ),
      }),
      execute: async ({ name, system_prompt, user_template }) => {
        const promptRes = (await callRespan(
          apiKey,
          "POST",
          `/api/prompts/`,
          { name },
        )) as Record<string, unknown>;
        const promptId = String(promptRes.id ?? promptRes.prompt_id ?? "");
        if (!promptId) throw new Error("Failed to create prompt");

        const messages: Array<{ role: string; content: string }> = [
          { role: "system", content: system_prompt },
        ];
        if (user_template) {
          messages.push({ role: "user", content: user_template });
        }

        // Create v1 (draft)
        const versionRes = (await callRespan(
          apiKey,
          "POST",
          `/api/prompts/${promptId}/versions/`,
          { messages, model: "gpt-4o-mini" },
        )) as Record<string, unknown>;
        const versionNum = Number(versionRes.version ?? 1);

        // Deploy v1 so experiments can run against it
        const deployed = await deployVersion(
          apiKey,
          promptId,
          versionNum,
          messages,
          "gpt-4o-mini",
        );

        const allContent = messages.map((m) => m.content).join(" ");
        const variableMatches = allContent.match(/\{\{(\w+)\}\}/g) ?? [];
        const variables = [
          ...new Set(variableMatches.map((m) => m.replace(/\{\{|\}\}/g, ""))),
        ];

        return {
          prompt_id: promptId,
          name,
          messages,
          variables,
          version: deployed,
        };
      },
    }),

    // -------------------------------------------------------------------
    // 3. generate_test_cases
    // -------------------------------------------------------------------
    generate_test_cases: tool({
      description:
        "Generate targeted test cases for a prompt and create a dataset in Respan. Uses a powerful model for high-quality generation.",
      parameters: z.object({
        prompt_id: z.string().describe("The prompt ID"),
        prompt_messages: z
          .array(
            z.object({
              role: z.string(),
              content: z.string(),
            }),
          )
          .describe("The prompt messages to generate test cases for"),
        variables: z
          .array(z.string())
          .describe("Variable names used in the prompt"),
        num_cases: z
          .number()
          .optional()
          .default(6)
          .describe("Number of test cases to generate (default 6)"),
        focus_areas: z
          .array(z.string())
          .optional()
          .describe(
            "Specific areas to focus on, e.g. edge cases, common use cases, adversarial inputs",
          ),
      }),
      execute: async ({
        prompt_id,
        prompt_messages,
        variables,
        num_cases,
        focus_areas,
      }) => {
        const variableKeys =
          variables.length > 0 ? variables : ["user_input"];

        const focusText = focus_areas?.length
          ? `\n## Focus Areas\n${focus_areas.map((f) => `- ${f}`).join("\n")}`
          : "";

        const prompt = `You are an expert test case designer. Generate ${num_cases} diverse test cases for the following prompt.

## Prompt Messages
${prompt_messages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n")}

## Variables
${variableKeys.join(", ")}
${focusText}

## Instructions
Generate a JSON array of test cases. Each must have:
- "input": object with keys matching the variables (${variableKeys.map((v) => `"${v}"`).join(", ")})
- "expected_output": the ideal/expected response

Make test cases diverse: include typical cases, edge cases, and challenging inputs.
Return ONLY a JSON array, no other text.`;

        const result = await callGateway(apiKey, {
          model: "claude-opus-4-6",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 4096,
        });

        let rawCases: Array<Record<string, unknown>>;
        try {
          rawCases = JSON.parse(extractJSON(result.content));
          if (!Array.isArray(rawCases)) throw new Error("Not an array");
        } catch {
          throw new Error(
            `Failed to parse test cases: ${result.content.slice(0, 300)}`,
          );
        }

        // Normalize inputs to match variable keys
        const testCases = rawCases.map((tc, idx) => {
          const rawInput = tc.input;
          let inputObj: Record<string, string> = {};

          if (typeof rawInput === "string") {
            inputObj[variableKeys[0]] = rawInput;
          } else if (
            rawInput &&
            typeof rawInput === "object" &&
            !Array.isArray(rawInput)
          ) {
            const inputKeys = Object.keys(rawInput as Record<string, unknown>);
            const inputValues = Object.values(
              rawInput as Record<string, unknown>,
            ).map(String);
            const keysMatch = variableKeys.every((v) => inputKeys.includes(v));
            if (keysMatch) {
              for (const v of variableKeys) {
                inputObj[v] = String(
                  (rawInput as Record<string, unknown>)[v] ?? "",
                );
              }
            } else {
              for (let i = 0; i < variableKeys.length; i++) {
                inputObj[variableKeys[i]] =
                  i < inputValues.length ? inputValues[i] : "";
              }
            }
          } else {
            inputObj[variableKeys[0]] = String(
              rawInput ?? `test case ${idx + 1}`,
            );
          }

          return {
            input: inputObj,
            expected_output: String(tc.expected_output ?? ""),
          };
        });

        // Create dataset
        const promptData = (await callRespan(
          apiKey,
          "GET",
          `/api/prompts/${prompt_id}/`,
        )) as Record<string, unknown>;
        const promptName = String(promptData.name ?? "prompt");

        const dsRes = (await callRespan(apiKey, "POST", `/api/datasets/`, {
          name: `Optimizer - ${promptName.slice(0, 60)}`,
          is_empty: true,
        })) as { id: string };
        const datasetId = dsRes.id;
        if (!datasetId) throw new Error("Failed to create dataset");

        // Add logs
        for (const tc of testCases) {
          await callRespan(
            apiKey,
            "POST",
            `/api/datasets/${datasetId}/logs/`,
            {
              input: tc.input,
              expected_output: tc.expected_output,
            },
          );
        }

        return {
          dataset_id: datasetId,
          test_cases: testCases,
          count: testCases.length,
        };
      },
    }),

    // -------------------------------------------------------------------
    // 4. create_evaluators
    // -------------------------------------------------------------------
    create_evaluators: tool({
      description:
        "Create evaluation pipelines in Respan, one per metric. Each evaluator scores outputs on a 0-10 scale.",
      parameters: z.object({
        metrics: z
          .array(
            z.object({
              name: z
                .string()
                .describe("Metric name, e.g. Accuracy, Tone, Safety"),
              definition: z
                .string()
                .describe(
                  "What the evaluator should check for, e.g. 'Does the output accurately answer the question?'",
                ),
              scoring_rubric: z
                .string()
                .optional()
                .describe(
                  "Custom rubric. Default: 0=Terrible, 5=Average, 10=Perfect",
                ),
            }),
          )
          .describe("Array of metrics to create evaluators for"),
      }),
      execute: async ({ metrics }) => {
        const evaluators: Array<{
          name: string;
          id: string;
          workflow_version_id?: string;
          metric: string;
        }> = [];

        for (const metric of metrics) {
          const llmConfig = {
            model: "gpt-4o-mini",
            evaluator_definition: `Evaluate the output for: ${metric.definition}
Input: {{input}}
Output: {{output}}
Expected: {{expected_output}}
Return only JSON: {"score": number}.`,
            scoring_rubric:
              metric.scoring_rubric ??
              "0=Completely wrong, 1-3=Poor quality, 4-6=Acceptable, 7-9=Good, 10=Excellent",
            temperature: 0.1,
          };
          const metricEvalId = "optimizer_metric_eval";
          const baselineId = "optimizer_baseline_score";
          const finalScoreId = "optimizer_final_score";
          const created = (await callRespan(apiKey, "POST", `/api/workflows/`, {
            name: `Optimizer - ${metric.name}`,
            description: `Evaluation pipeline for: ${metric.definition}`,
            type: "evaluators",
            trigger_event_type: "eval_only",
            tasks: [
              {
                id: metricEvalId,
                type: "eval",
                label: "optimizer_metric_eval",
                generation_method: "llm",
                config: {
                  name: `Optimizer - ${metric.name}`,
                  generation_method: "llm",
                  score_value_type: "numerical",
                  score_config: { min_score: 0, max_score: 10 },
                  llm_config: llmConfig,
                  _blockly_hidden_eval: true,
                  _blockly_node_id: metricEvalId,
                  _blockly_output_field: "primary_score",
                  _blockly_is_result: false,
                  _blockly_evaluator_kind: "llm",
                },
              },
              {
                id: baselineId,
                type: "transform",
                label: "optimizer_baseline_score",
                config: {
                  transform_type: "constant",
                  output_contract: "score_fields",
                  params: { value: 8.0 },
                },
              },
              {
                id: finalScoreId,
                type: "compute",
                label: "optimizer_final_score",
                config: {
                  function: "weighted_average",
                  inputs: [
                    { source: `state.${metricEvalId}`, field: "primary_score", weight: 0.9 },
                    { source: `state.${baselineId}`, field: "primary_score", weight: 0.1 },
                  ],
                  label: "optimizer_final_score",
                  _blockly_is_result: true,
                },
              },
            ],
          })) as { id?: string; workflow_id?: string; name?: string };

          const workflowId = created.workflow_id;
          if (!workflowId) {
            throw new Error(`Failed to create evaluation pipeline for ${metric.name}: no workflow_id returned`);
          }

          const committed = (await callRespan(apiKey, "POST", `/api/workflows/${workflowId}/commits/`, {
            description: "Committed from prompt optimizer.",
          })) as { id?: string; version?: number };
          const deployed = (await callRespan(apiKey, "POST", `/api/workflows/${workflowId}/deployments/`, {})) as { id?: string; version?: number };

          evaluators.push({
            name: metric.name,
            id: workflowId,
            workflow_version_id: deployed.id ?? committed.id ?? created.id,
            metric: metric.definition,
          });
        }

        return { evaluators };
      },
    }),

    // -------------------------------------------------------------------
    // 5. run_experiment
    // -------------------------------------------------------------------
    run_experiment: tool({
      description:
        "Run a baseline evaluation through the Respan gateway: execute the prompt against test cases and score outputs with the selected evaluators. Returns per-metric scores and built-in metrics.",
      parameters: z.object({
        prompt_id: z.string().describe("The prompt ID to evaluate"),
        dataset_id: z.string().describe("The dataset ID with test cases"),
        evaluator_workflow_ids: z
          .array(z.string())
          .describe("Array of evaluation pipeline workflow IDs to score with"),
        label: z
          .string()
          .optional()
          .describe("Label for this experiment run, e.g. 'Baseline' or 'V2'"),
      }),
      execute: async ({ prompt_id, dataset_id, evaluator_workflow_ids, label }) => {
        const promptData = (await callRespan(
          apiKey,
          "GET",
          "/api/prompts/" + prompt_id + "/",
        )) as Record<string, unknown>;
        const versions = await getPromptVersions(apiKey, prompt_id);
        const promptVersion = getPreferredPromptVersion(promptData, versions);
        if (!promptVersion) throw new Error("No version found for this prompt");

        const promptMessages = normalizeMessages(promptVersion.messages);
        const model = normalizeGatewayModel(promptVersion.model);
        const datasetLogs = await getDatasetLogs(apiKey, dataset_id);
        if (datasetLogs.length === 0) {
          throw new Error("The selected dataset has no logs. Generate test cases before running the baseline evaluation.");
        }

        const evaluators = await getEvaluatorDetails(apiKey, evaluator_workflow_ids);
        if (evaluators.length === 0) {
          throw new Error("No evaluators were provided for the baseline evaluation.");
        }

        const generations = await mapLimit(datasetLogs, 4, async (logEntry) => {
          const input = asRecord((logEntry as any).input ?? (logEntry as any).extracted_fields?.input);
          const expectedOutput = extractOutputText((logEntry as any).expected_output);
          const messages = renderPromptMessages(promptMessages, input);
          const startedAt = Date.now();
          let generation;
          try {
            generation = await callGateway(apiKey, {
              model,
              messages,
              temperature: Number(promptVersion.temperature ?? 0.7),
              max_tokens: Number(promptVersion.max_tokens ?? 1024),
            });
          } catch (error) {
            if (model === "gpt-4o-mini") throw error;
            generation = await callGateway(apiKey, {
              model: "gpt-4o-mini",
              messages,
              temperature: Number(promptVersion.temperature ?? 0.7),
              max_tokens: Number(promptVersion.max_tokens ?? 1024),
            });
          }

          const usage = extractUsage(generation.raw);
          const latency = usage.latency || (Date.now() - startedAt) / 1000;
          return {
            input,
            expectedOutput,
            output: generation.content,
            cost: usage.cost,
            latency,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
          };
        });

        const evaluatorScoreSums: Record<string, number> = {};
        const evaluatorScoreCounts: Record<string, number> = {};
        const perTestScores: Array<Record<string, number>> = [];

        await mapLimit(generations, 3, async (generation, generationIndex) => {
          const testScores: Record<string, number> = {};
          await mapLimit(evaluators, 3, async (evaluator) => {
            const evalPrompt = `You are scoring an LLM output for a prompt optimization experiment.

Metric: ${evaluator.name}
Definition and instructions:
${evaluator.definition}

Rubric:
${evaluator.rubric}

Input:
${JSON.stringify(generation.input)}

Output:
${generation.output}

Expected output:
${generation.expectedOutput}

Return only JSON: {"score": number, "reasoning": "brief reason"}. The score must be from 0 to 10.`;

            const evalResult = await callGateway(apiKey, {
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: evalPrompt }],
              temperature: 0,
              max_tokens: 512,
            });
            const score = extractScore(evalResult.content);
            testScores[evaluator.id] = score;
            evaluatorScoreSums[evaluator.id] =
              (evaluatorScoreSums[evaluator.id] ?? 0) + score;
            evaluatorScoreCounts[evaluator.id] =
              (evaluatorScoreCounts[evaluator.id] ?? 0) + 1;
          });
          perTestScores[generationIndex] = testScores;
        });

        const avgScores: Record<string, number> = {};
        for (const id of Object.keys(evaluatorScoreSums)) {
          avgScores[id] = evaluatorScoreSums[id] / (evaluatorScoreCounts[id] || 1);
        }

        const totalCost = generations.reduce((sum, item) => sum + item.cost, 0);
        const totalLatency = generations.reduce((sum, item) => sum + item.latency, 0);
        const totalTokens = generations.reduce(
          (sum, item) => sum + item.promptTokens + item.completionTokens,
          0,
        );
        const numLogs = generations.length;

        return {
          experiment_id: "gateway-baseline-" + Date.now(),
          label: label ?? "Baseline",
          mode: "gateway_direct",
          prompt_id,
          dataset_id,
          evaluator_names: Object.fromEntries(evaluators.map((e) => [e.id, e.name])),
          scores: avgScores,
          built_in_metrics: {
            avg_cost: numLogs > 0 ? totalCost / numLogs : 0,
            avg_latency: numLogs > 0 ? totalLatency / numLogs : 0,
            avg_tokens: numLogs > 0 ? totalTokens / numLogs : 0,
          },
          per_test_scores: perTestScores,
          num_logs: numLogs,
        };
      },
    }),

    // -------------------------------------------------------------------
    // 6. improve_prompt
    // -------------------------------------------------------------------
    improve_prompt: tool({
      description:
        "Analyze experiment results and create an improved prompt version. Uses a powerful reflection model (claude-opus) for deep analysis. Deploys the new version automatically.",
      parameters: z.object({
        prompt_id: z.string().describe("The prompt ID to improve"),
        current_messages: z
          .array(z.object({ role: z.string(), content: z.string() }))
          .describe("Current prompt messages"),
        scores: z
          .record(z.number())
          .describe(
            "Current per-metric average scores, e.g. { 'accuracy-eval': 7.2 }",
          ),
        weak_metrics: z
          .array(z.string())
          .optional()
          .describe("Metric names that scored lowest and need improvement"),
        test_cases_summary: z
          .string()
          .optional()
          .describe("Brief description of what the test cases cover"),
        user_feedback: z
          .string()
          .optional()
          .describe("Any specific feedback from the user about what to improve"),
      }),
      execute: async ({
        prompt_id,
        current_messages,
        scores,
        weak_metrics,
        test_cases_summary,
        user_feedback,
      }) => {
        const systemContent =
          current_messages.find((m) => m.role === "system")?.content ??
          current_messages.map((m) => m.content).join("\n");
        const nonSystemMessages = current_messages.filter(
          (m) => m.role !== "system",
        );

        const scoresText = Object.entries(scores)
          .map(([k, v]) => `- ${k}: ${v.toFixed(1)}/10`)
          .join("\n");

        const reflectionPrompt = `You are an expert prompt engineer. Analyze the following prompt's performance and create an improved version.

## Current System Prompt
${systemContent}

## Current Scores
${scoresText}

${weak_metrics?.length ? `## Weakest Metrics (focus improvement here)\n${weak_metrics.join(", ")}` : ""}

${test_cases_summary ? `## Test Cases Context\n${test_cases_summary}` : ""}

${user_feedback ? `## User Feedback\n${user_feedback}` : ""}

## Instructions
1. Analyze why the prompt scored low on weak metrics
2. Identify specific weaknesses in the prompt wording
3. Create a concrete improved system prompt

IMPORTANT: The improved prompt must preserve any {{variable}} placeholders exactly as they appear.

Respond with JSON only: { "analysis": "brief analysis of weaknesses", "improved_system_prompt": "the full improved system prompt" }`;

        const result = await callGateway(apiKey, {
          model: "claude-opus-4-6",
          messages: [{ role: "user", content: reflectionPrompt }],
          temperature: 0.7,
          max_tokens: 4096,
        });

        let analysis = "";
        let improvedSystemPrompt = systemContent;
        try {
          const parsed = JSON.parse(extractJSON(result.content));
          analysis =
            parsed.analysis ?? "Analysis not available";
          improvedSystemPrompt =
            parsed.improved_system_prompt ??
            parsed.improved_prompt ??
            systemContent;
        } catch {
          // If parsing fails, try to use the raw content as the improved prompt
          improvedSystemPrompt = result.content;
          analysis = "Reflection model returned unstructured output.";
        }

        // Create new version with improved prompt and deploy it
        const newMessages = [
          { role: "system", content: improvedSystemPrompt },
          ...(nonSystemMessages.length > 0
            ? nonSystemMessages
            : [{ role: "user", content: "{{user_input}}" }]),
        ];

        // Create new version (draft)
        const versionRes = (await callRespan(
          apiKey,
          "POST",
          `/api/prompts/${prompt_id}/versions/`,
          {
            messages: newMessages,
            model: "gpt-4o-mini",
          },
        )) as Record<string, unknown>;
        const newVersionNum = Number(versionRes.version ?? 0);

        // Deploy it so experiments can run against it
        await deployVersion(
          apiKey,
          prompt_id,
          newVersionNum,
          newMessages,
          "gpt-4o-mini",
        );

        return {
          analysis,
          new_messages: newMessages,
          new_version: newVersionNum,
          deployed: true,
        };
      },
    }),

    // -------------------------------------------------------------------
    // 7. get_optimization_summary
    // -------------------------------------------------------------------
    get_optimization_summary: tool({
      description:
        "Compute final optimization summary: best version, score improvements, Pareto frontier. Call this when the user is done iterating.",
      parameters: z.object({
        iterations: z
          .array(
            z.object({
              version: z.number().describe("Prompt version number"),
              scores: z
                .record(z.number())
                .describe("Per-metric average scores"),
              avg_cost: z.number().describe("Average cost per test case"),
              avg_latency: z.number().describe("Average latency in seconds"),
            }),
          )
          .describe(
            "Array of all iteration results, starting with the baseline (seed)",
          ),
        evaluator_names: z
          .record(z.string())
          .describe(
            "Map of evaluation pipeline workflow ID to human-readable name.",
          ),
      }),
      execute: async ({ iterations, evaluator_names }) => {
        if (iterations.length === 0)
          return { error: "No iterations provided" };

        const seed = iterations[0];
        const allMetricSlugs = [
          ...new Set(iterations.flatMap((it) => Object.keys(it.scores))),
        ];

        // Find best by average score across all metrics
        let bestIdx = 0;
        let bestAvg = 0;
        for (let i = 0; i < iterations.length; i++) {
          const vals = Object.values(iterations[i].scores);
          const avg = vals.length > 0
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : 0;
          if (avg > bestAvg) {
            bestAvg = avg;
            bestIdx = i;
          }
        }
        const best = iterations[bestIdx];

        // Per-metric improvement
        const improvements: Record<
          string,
          { from: number; to: number; change: number; name: string }
        > = {};
        for (const slug of allMetricSlugs) {
          const from = seed.scores[slug] ?? 0;
          const to = best.scores[slug] ?? 0;
          improvements[slug] = {
            from,
            to,
            change: to - from,
            name: evaluator_names[slug] ?? slug,
          };
        }

        // Pareto frontier
        const paretoEntries: ParetoEntry[] = iterations.map((it) => ({
          version: it.version,
          scores: it.scores,
          cost: it.avg_cost,
          latency: it.avg_latency,
        }));
        const frontier = computeParetoFrontier(paretoEntries);

        return {
          best_version: best.version,
          best_avg_score: bestAvg,
          seed_avg_score:
            Object.values(seed.scores).reduce((a, b) => a + b, 0) /
            (Object.keys(seed.scores).length || 1),
          improvements,
          all_iterations: iterations.map((it) => ({
            version: it.version,
            scores: it.scores,
            avg_cost: it.avg_cost,
            avg_latency: it.avg_latency,
          })),
          pareto_frontier: frontier.map((e) => e.version),
        };
      },
    }),
  };
}
