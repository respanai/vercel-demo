import { tool } from "ai";
import { z } from "zod";
import {
  callKeywordsAI,
  callGateway,
  extractJSON,
  computeParetoFrontier,
  type ParetoEntry,
} from "./keywords-api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  messages: Array<{ role: string; content: string }>,
  model: string,
): Promise<number> {
  // Check if the version is already readonly
  const versionsRes = (await callKeywordsAI(
    apiKey,
    "GET",
    `/api/prompts/${promptId}/versions/`,
  )) as any;
  const versions = Array.isArray(versionsRes)
    ? versionsRes
    : (versionsRes?.results ?? []);
  const target = versions.find((v: any) => Number(v.version) === versionNum);

  if (target?.is_deployed) return versionNum; // already deployed

  if (target && target.readonly !== true) {
    // Draft version — create a new version to lock this one as readonly
    await callKeywordsAI(apiKey, "POST", `/api/prompts/${promptId}/versions/`, {
      messages,
      model,
    });
  }

  // Now the target version is readonly — deploy it
  await callKeywordsAI(
    apiKey,
    "PATCH",
    `/api/prompts/${promptId}/versions/${versionNum}/`,
    { deploy: true },
  );
  return versionNum;
}

export function tools(apiKey: string) {
  return {
    // -------------------------------------------------------------------
    // 1. fetch_prompt
    // -------------------------------------------------------------------
    fetch_prompt: tool({
      description:
        "Fetch an existing prompt from Keywords AI, including its deployed version, messages, and variables.",
      parameters: z.object({
        prompt_id: z.string().describe("The prompt ID to fetch"),
      }),
      execute: async ({ prompt_id }) => {
        const promptData = (await callKeywordsAI(
          apiKey,
          "GET",
          `/api/prompts/${prompt_id}/`,
        )) as Record<string, unknown>;

        const versionsRes = (await callKeywordsAI(
          apiKey,
          "GET",
          `/api/prompts/${prompt_id}/versions/`,
        )) as any;
        const versions = Array.isArray(versionsRes)
          ? versionsRes
          : (versionsRes?.results ?? []);
        const targetVersion =
          versions.find((v: any) => v.is_deployed || v.is_active) ??
          versions[0];
        if (!targetVersion)
          throw new Error("No version found for this prompt");

        const messages = (targetVersion.messages ?? []) as Array<{
          role: string;
          content: string;
        }>;
        let deployedVersion = Number(targetVersion.version ?? 1);
        const model = (targetVersion as any).model ?? "gpt-4o-mini";

        // Ensure the version is deployed (required for experiments)
        deployedVersion = await deployVersion(
          apiKey,
          prompt_id,
          deployedVersion,
          messages,
          model,
        );

        const allContent = messages.map((m) => m.content).join(" ");
        const variableMatches = allContent.match(/\{\{(\w+)\}\}/g) ?? [];
        const variables = [
          ...new Set(variableMatches.map((m) => m.replace(/\{\{|\}\}/g, ""))),
        ];

        return {
          prompt_id,
          name: String(promptData.name ?? prompt_id),
          messages,
          variables,
          deployed_version: deployedVersion,
          version_count: versions.length,
        };
      },
    }),

    // -------------------------------------------------------------------
    // 2. create_prompt
    // -------------------------------------------------------------------
    create_prompt: tool({
      description:
        "Create a new prompt in Keywords AI with a system prompt and optional user template.",
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
        const promptRes = (await callKeywordsAI(
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
        const versionRes = (await callKeywordsAI(
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
        "Generate targeted test cases for a prompt and create a dataset in Keywords AI. Uses a powerful model for high-quality generation.",
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
        const promptData = (await callKeywordsAI(
          apiKey,
          "GET",
          `/api/prompts/${prompt_id}/`,
        )) as Record<string, unknown>;
        const promptName = String(promptData.name ?? "prompt");

        const dsRes = (await callKeywordsAI(apiKey, "POST", `/api/datasets/`, {
          name: `Optimizer - ${promptName.slice(0, 60)}`,
          is_empty: true,
        })) as { id: string };
        const datasetId = dsRes.id;
        if (!datasetId) throw new Error("Failed to create dataset");

        // Add logs
        for (const tc of testCases) {
          await callKeywordsAI(
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
        "Create LLM-based evaluators in Keywords AI, one per metric. Each evaluator scores outputs on a 0-10 scale.",
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
          slug: string;
          metric: string;
        }> = [];

        for (const metric of metrics) {
          const res = (await callKeywordsAI(
            apiKey,
            "POST",
            `/api/evaluators/`,
            {
              name: `Optimizer - ${metric.name}`,
              type: "llm",
              score_value_type: "numerical",
              configurations: {
                evaluator_definition: `Evaluate the output for: ${metric.definition}\n\nInput: {{input}}\nOutput: {{output}}\nExpected: {{expected_output}}\n\nScore on a 0-10 scale.`,
                scoring_rubric:
                  metric.scoring_rubric ??
                  "0=Completely wrong, 1-3=Poor quality, 4-6=Acceptable, 7-9=Good, 10=Excellent",
                llm_engine: "gpt-4o-mini",
                min_score: 0,
                max_score: 10,
                model_options: { temperature: 0.1 },
              },
            },
          )) as { evaluator_slug?: string; id?: string; name?: string };

          if (!res.evaluator_slug)
            throw new Error(
              `Failed to create evaluator for ${metric.name}: no slug returned`,
            );

          evaluators.push({
            name: metric.name,
            slug: res.evaluator_slug,
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
        "Run an experiment: evaluate the currently deployed prompt version against all test cases and evaluators. Returns per-metric scores and built-in metrics (cost, latency). Takes 1-3 minutes.",
      parameters: z.object({
        prompt_id: z.string().describe("The prompt ID to evaluate"),
        dataset_id: z.string().describe("The dataset ID with test cases"),
        evaluator_slugs: z
          .array(z.string())
          .describe("Array of evaluator slugs to score with"),
        label: z
          .string()
          .optional()
          .describe("Label for this experiment run, e.g. 'Baseline' or 'V2'"),
      }),
      execute: async ({ prompt_id, dataset_id, evaluator_slugs, label }) => {
        // Ensure a version is deployed before running the experiment.
        // The deployVersion helper is already called by fetch_prompt and
        // improve_prompt, so this is a safety check.

        // Create experiment with ALL evaluator slugs in one call
        const expRes = (await callKeywordsAI(
          apiKey,
          "POST",
          `/api/v2/experiments/`,
          {
            name: `Optimizer - ${label ?? "run"}`,
            dataset_id,
            workflow: [{ type: "prompt", config: { prompt_id } }],
            evaluator_slugs,
          },
        )) as Record<string, unknown>;

        const experimentId = String(
          expRes.id ?? expRes.experiment_id ?? expRes.unique_id ?? "",
        );
        if (!experimentId)
          throw new Error(
            `Failed to create experiment: ${JSON.stringify(expRes)}`,
          );

        // Poll for completion
        const maxPollMs = 180_000;
        const pollStart = Date.now();
        let expData: Record<string, unknown> = {};
        while (Date.now() - pollStart < maxPollMs) {
          await sleep(5000);
          expData = (await callKeywordsAI(
            apiKey,
            "GET",
            `/api/v2/experiments/${experimentId}/`,
          )) as Record<string, unknown>;
          const st = String(expData.status ?? "");
          if (st === "completed" || st === "done") break;
          if (st === "failed" || st === "error")
            throw new Error(`Experiment failed: ${JSON.stringify(expData)}`);
        }

        const finalStatus = String(expData.status ?? "");
        if (finalStatus !== "completed" && finalStatus !== "done")
          throw new Error(`Experiment timed out (status: ${finalStatus})`);

        // Wait for logs
        let logs: Array<Record<string, unknown>> = [];
        for (let logPoll = 0; logPoll < 20; logPoll++) {
          await sleep(5000);
          const logsList = (await callKeywordsAI(
            apiKey,
            "GET",
            `/api/v2/experiments/${experimentId}/logs/list/`,
          )) as { results?: Array<Record<string, unknown>> };
          logs = logsList.results ?? [];
          if (logs.length > 0) break;
        }

        // Aggregate scores per evaluator + built-in metrics
        const evaluatorScoreSums: Record<string, number> = {};
        const evaluatorScoreCounts: Record<string, number> = {};
        let totalCost = 0;
        let totalLatency = 0;
        let totalTokens = 0;
        let numLogs = 0;
        const perTestScores: Array<Record<string, number>> = [];

        for (const logEntry of logs) {
          const logId = String(
            logEntry.id ?? logEntry.unique_id ?? logEntry.trace_id ?? "",
          );
          if (!logId) continue;

          // Poll individual log for scores
          let detail: Record<string, unknown> = {};
          let logScores: Record<string, unknown> | null = null;
          for (let attempt = 0; attempt < 15; attempt++) {
            detail = (await callKeywordsAI(
              apiKey,
              "GET",
              `/api/v2/experiments/${experimentId}/logs/${logId}/`,
            )) as Record<string, unknown>;
            const rawScores = detail.scores as
              | Record<string, unknown>
              | undefined;
            if (rawScores && Object.keys(rawScores).length > 0) {
              logScores = rawScores;
              break;
            }
            if (attempt < 14) await sleep(3000);
          }

          // Extract per-evaluator scores
          const testScores: Record<string, number> = {};
          if (logScores) {
            for (const [slug, evalData] of Object.entries(logScores)) {
              const ed = evalData as Record<string, unknown>;
              const sv =
                ed?.score_value ?? ed?.numerical_value ?? ed?.value ?? 0;
              const score = Math.min(
                10,
                Math.max(0, typeof sv === "number" ? sv : parseFloat(String(sv)) || 0),
              );
              testScores[slug] = score;
              evaluatorScoreSums[slug] =
                (evaluatorScoreSums[slug] ?? 0) + score;
              evaluatorScoreCounts[slug] =
                (evaluatorScoreCounts[slug] ?? 0) + 1;
            }
          }

          // Built-in metrics
          const logCost =
            typeof detail.cost === "number"
              ? detail.cost
              : parseFloat(String(detail.cost ?? "0")) || 0;
          const logLatency =
            typeof detail.latency === "number"
              ? detail.latency
              : parseFloat(String(detail.latency ?? "0")) || 0;
          const promptTokens =
            typeof detail.prompt_tokens === "number"
              ? detail.prompt_tokens
              : 0;
          const completionTokens =
            typeof detail.completion_tokens === "number"
              ? detail.completion_tokens
              : 0;

          totalCost += logCost;
          totalLatency += logLatency;
          totalTokens += promptTokens + completionTokens;
          numLogs++;
          perTestScores.push(testScores);
        }

        // Compute averages
        const avgScores: Record<string, number> = {};
        for (const slug of Object.keys(evaluatorScoreSums)) {
          avgScores[slug] =
            evaluatorScoreSums[slug] / (evaluatorScoreCounts[slug] || 1);
        }

        const avgCost = numLogs > 0 ? totalCost / numLogs : 0;
        const avgLatency = numLogs > 0 ? totalLatency / numLogs : 0;
        const avgTokens = numLogs > 0 ? totalTokens / numLogs : 0;

        return {
          experiment_id: experimentId,
          scores: avgScores,
          built_in_metrics: {
            avg_cost: avgCost,
            avg_latency: avgLatency,
            avg_tokens: avgTokens,
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
        const versionRes = (await callKeywordsAI(
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
            "Map of evaluator slug to human-readable name, e.g. { 'accuracy-eval': 'Accuracy' }",
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
