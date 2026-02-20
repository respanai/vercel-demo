export const runtime = "nodejs";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCase {
  input: Record<string, string>;
  expected_output: string;
}

interface ParetoEntry {
  versionNumber: number;
  promptText: string;
  scores: Record<number, number>; // testCaseIdx -> score
  meanScore: number;
  avgCost: number; // average USD cost per test case (prompt + completion)
  actualOutputs: Record<number, string>;
}

type SSEEvent =
  | { type: "setup"; step: string; message: string; data?: unknown }
  | { type: "generation"; gen: number; total: number; step: string; message: string; score?: number; cost?: number; promptText?: string }
  | { type: "complete"; bestVersion: number; bestScore: number; bestPrompt: string; seedScore: number; paretoFrontier: ParetoEntry[]; allCandidates: ParetoEntry[]; promptId: string; datasetId: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getKeywordsAIKey(req: Request): string | undefined {
  const fromEnv = process.env.KEYWORDSAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromHeader = req.headers.get("x-keywordsai-api-key")?.trim();
  return fromHeader || undefined;
}

async function callGateway(apiKey: string, body: Record<string, unknown>): Promise<{ content: string; raw: unknown }> {
  const res = await fetch("https://api.keywordsai.co/api/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gateway error ${res.status}: ${JSON.stringify(json)}`);
  const content = json?.choices?.[0]?.message?.content ?? "";
  return { content, raw: json };
}

async function callKeywordsAI(apiKey: string, method: string, url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Keywords AI ${method} ${url} failed (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

function extractOutputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const choiceContent = (o as any)?.choices?.[0]?.message?.content;
    if (choiceContent) return String(choiceContent);
    if (typeof (o as any)?.content === "string") return (o as any).content;
    if (typeof (o as any)?.message?.content === "string") return (o as any).message.content;
    return JSON.stringify(output);
  }
  return String(output ?? "");
}

// ---------------------------------------------------------------------------
// Pareto logic — cost (lower is better) vs score (higher is better)
// ---------------------------------------------------------------------------

function dominatesCostScore(a: ParetoEntry, b: ParetoEntry): boolean {
  const betterOrEqualScore = a.meanScore >= b.meanScore;
  const betterOrEqualCost = a.avgCost <= b.avgCost;
  const strictlyBetterScore = a.meanScore > b.meanScore;
  const strictlyBetterCost = a.avgCost < b.avgCost;
  return betterOrEqualScore && betterOrEqualCost && (strictlyBetterScore || strictlyBetterCost);
}

function computeParetoFrontier(candidates: ParetoEntry[]): ParetoEntry[] {
  return candidates.filter((c) => {
    return !candidates.some((other) => other !== c && dominatesCostScore(other, c));
  });
}

function sampleFromFrontier(frontier: ParetoEntry[]): ParetoEntry {
  const weights = frontier.map((e) => 1 / (e.meanScore + 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < frontier.length; i++) {
    r -= weights[i];
    if (r <= 0) return frontier[i];
  }
  return frontier[frontier.length - 1];
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const rawKey = getKeywordsAIKey(req);
  if (!rawKey) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const apiKey: string = rawKey;

  const body = await req.json().catch(() => ({}));
  const {
    promptId: inputPromptId = "",
    iterations = 5,
    taskModel = "gpt-4o-mini",
    reflectionModel = "gpt-4o",
    numTestCases = 6,
  } = body ?? {};

  if (!inputPromptId) {
    return Response.json({ error: "promptId is required" }, { status: 400 });
  }

  const BASE = "https://api.keywordsai.co";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // ---------------------------------------------------------------
        // Phase 1 — Setup (using existing prompt)
        // ---------------------------------------------------------------

        const promptId = inputPromptId;

        // 1. Fetch existing prompt
        send({ type: "setup", step: "prompt", message: "Fetching existing prompt..." });
        const promptData = (await callKeywordsAI(apiKey, "GET", `${BASE}/api/prompts/${promptId}/`)) as Record<string, unknown>;
        send({ type: "setup", step: "prompt", message: `Found prompt: ${promptData.name ?? promptId}` });

        // 2. Fetch versions list and find the deployed one
        send({ type: "setup", step: "prompt_version", message: "Fetching deployed version..." });
        const versionsRes = (await callKeywordsAI(apiKey, "GET", `${BASE}/api/prompts/${promptId}/versions/`)) as Array<Record<string, unknown>>;
        const versions = Array.isArray(versionsRes) ? versionsRes : (versionsRes as any)?.results ?? [];
        const deployedVersion = versions.find((v: any) => v.is_deployed || v.is_active) ?? versions[0];
        if (!deployedVersion) throw new Error("No deployed version found for this prompt");

        const v1Res = { id: String(deployedVersion.id), version: Number(deployedVersion.version ?? 1) };
        const seedMessages = (deployedVersion.messages ?? []) as Array<{ role: string; content: string }>;
        const initialPrompt = seedMessages.find((m) => m.role === "system")?.content ?? seedMessages.map((m) => m.content).join("\n");
        send({ type: "setup", step: "prompt_version", message: `Using deployed version ${v1Res.version} as seed` });
        send({ type: "setup", step: "prompt_version", message: `Seed messages: ${seedMessages.length} message(s)` });

        // 3. Extract variables from prompt messages (e.g. {{user_input}}, {{context}})
        const allContent = seedMessages.map((m) => m.content).join(" ");
        const variableMatches = allContent.match(/\{\{(\w+)\}\}/g) ?? [];
        const variables = [...new Set(variableMatches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
        send({ type: "setup", step: "variables", message: `Found variables: ${variables.length > 0 ? variables.join(", ") : "(none)"}` });

        // 4. Generate test cases based on prompt content + variables
        send({ type: "setup", step: "test_cases", message: "Generating test cases..." });
        const variableKeys = variables.length > 0 ? variables : ["user_input"];
        const testCasePrompt = `You are given a prompt template. Generate ${numTestCases} diverse test cases for it.

## Prompt Messages
${seedMessages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n")}

## Variables in the prompt
${variableKeys.join(", ")}

## Instructions
Generate a JSON array of test cases. Each test case must have:
- "input": an object with keys matching the variables above (${variableKeys.map((v) => `"${v}"`).join(", ")}), each with a realistic test value
- "expected_output": the expected/ideal response

Return a JSON array only, no other text:
[{ "input": { ${variableKeys.map((v) => `"${v}": "..."`).join(", ")} }, "expected_output": "..." }, ...]

Make the test cases diverse, covering edge cases and typical cases.`;
        const tcResult = await callGateway(apiKey, {
          model: reflectionModel,
          messages: [{ role: "user", content: testCasePrompt }],
          temperature: 0.7,
          max_tokens: 2048,
        });
        let rawTestCases: Array<Record<string, unknown>>;
        try {
          rawTestCases = JSON.parse(extractJSON(tcResult.content));
          if (!Array.isArray(rawTestCases)) throw new Error("Not an array");
        } catch {
          throw new Error(`Failed to parse test cases: ${tcResult.content.slice(0, 200)}`);
        }

        // Normalize test cases: ensure input keys match prompt variables exactly
        const testCases = rawTestCases.map((tc, idx) => {
          const rawInput = tc.input;
          let inputObj: Record<string, string> = {};

          if (typeof rawInput === "string") {
            // LLM returned a plain string — assign to the first variable
            inputObj[variableKeys[0]] = rawInput;
          } else if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)) {
            const inputKeys = Object.keys(rawInput as Record<string, unknown>);
            const inputValues = Object.values(rawInput as Record<string, unknown>).map(String);

            // Check if the keys already match the expected variables
            const keysMatch = variableKeys.every((v) => inputKeys.includes(v));
            if (keysMatch) {
              // Keys match — use as-is, picking only the expected variables
              for (const v of variableKeys) {
                inputObj[v] = String((rawInput as Record<string, unknown>)[v] ?? "");
              }
            } else {
              // Keys don't match — map positionally (LLM used different key names)
              for (let i = 0; i < variableKeys.length; i++) {
                inputObj[variableKeys[i]] = i < inputValues.length ? inputValues[i] : "";
              }
            }
          } else {
            // Fallback: stringify whatever we got into the first variable
            inputObj[variableKeys[0]] = String(rawInput ?? `test case ${idx + 1}`);
          }

          return {
            input: inputObj,
            expected_output: String(tc.expected_output ?? ""),
          };
        });

        send({ type: "setup", step: "test_cases", message: `Generated ${testCases.length} test cases (variables: ${variableKeys.join(", ")})`, data: testCases });

        // 5. Create dataset
        send({ type: "setup", step: "dataset", message: "Creating dataset..." });
        const promptName = String(promptData.name ?? "prompt");
        const dsRes = (await callKeywordsAI(apiKey, "POST", `${BASE}/api/datasets/`, {
          name: `GEPA - ${promptName.slice(0, 60)}`,
          is_empty: true,
        })) as { id: string };
        const datasetId = dsRes.id;
        if (!datasetId) throw new Error("Failed to create dataset: no id returned");
        send({ type: "setup", step: "dataset", message: `Created dataset ${datasetId}` });

        // 6. Add dataset logs — input keys match prompt variables exactly
        send({ type: "setup", step: "dataset_logs", message: `Adding ${testCases.length} test cases (keys: ${variableKeys.join(", ")})...` });
        for (const tc of testCases) {
          await callKeywordsAI(apiKey, "POST", `${BASE}/api/datasets/${datasetId}/logs/`, {
            input: tc.input,
            expected_output: tc.expected_output,
          });
        }
        send({ type: "setup", step: "dataset_logs", message: `Added ${testCases.length} logs to dataset` });

        // 7. Auto-generate task description and eval criteria
        send({ type: "setup", step: "generate", message: "Generating task description and evaluation criteria..." });
        const autoGenPrompt = `Analyze the following prompt and generate:
1. A concise task description (what this prompt is designed to do)
2. Evaluation criteria for scoring outputs 0-10

## Prompt Messages
${seedMessages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n")}

## Variables
${variableKeys.join(", ")}

## Example test case
${JSON.stringify(testCases[0], null, 2)}

Respond with JSON only: { "taskDescription": "...", "evalCriteria": "..." }`;

        const autoGenResult = await callGateway(apiKey, {
          model: reflectionModel,
          messages: [{ role: "user", content: autoGenPrompt }],
          temperature: 0.3,
          max_tokens: 1024,
        });
        let taskDescription: string;
        let evalCriteria: string;
        try {
          const parsed = JSON.parse(extractJSON(autoGenResult.content));
          const rawTask = parsed.taskDescription ?? parsed.task_description ?? "";
          const rawEval = parsed.evalCriteria ?? parsed.eval_criteria ?? "";
          taskDescription = typeof rawTask === "string" ? rawTask : JSON.stringify(rawTask);
          evalCriteria = typeof rawEval === "string" ? rawEval : JSON.stringify(rawEval);
          if (!taskDescription || !evalCriteria) throw new Error("Missing fields");
        } catch {
          throw new Error(`Failed to auto-generate task description / eval criteria: ${autoGenResult.content.slice(0, 200)}`);
        }
        send({ type: "setup", step: "generate", message: `Task: ${taskDescription.slice(0, 120)}` });
        send({ type: "setup", step: "generate", message: `Eval: ${evalCriteria.slice(0, 120)}` });

        // 8. Create evaluator
        send({ type: "setup", step: "evaluator", message: "Creating evaluator..." });
        const evalRes = (await callKeywordsAI(apiKey, "POST", `${BASE}/api/evaluators/`, {
          name: `GEPA Eval - ${promptName.slice(0, 50)}`,
          type: "llm",
          score_value_type: "numerical",
          configurations: {
            evaluator_definition: `Evaluate the output based on the following criteria:\n${evalCriteria}\n\nYou MUST score on a 0-10 scale. Input: {{input}} Output: {{output}} Expected: {{expected_output}}`,
            scoring_rubric: "0=Completely wrong, 1-3=Poor, 4-6=Partially correct, 7-9=Mostly correct, 10=Perfect",
            llm_engine: "gpt-4o-mini",
            min_score: 0,
            max_score: 10,
            model_options: { temperature: 0.1 },
          },
        })) as { evaluator_slug?: string; id?: string };
        const evaluatorSlug = evalRes.evaluator_slug;
        if (!evaluatorSlug) throw new Error("Failed to create evaluator: no evaluator_slug returned");
        send({ type: "setup", step: "evaluator", message: `Created evaluator (${evaluatorSlug})` });

        send({ type: "setup", step: "done", message: "Setup complete. Starting optimization loop..." });

        // ---------------------------------------------------------------
        // Experiment helpers
        // ---------------------------------------------------------------

        // Build the non-system messages from the seed (preserves variable placeholders)
        const seedNonSystemMessages = seedMessages.filter((m) => m.role !== "system");
        if (seedNonSystemMessages.length === 0) {
          // Fallback: if seed had no user messages, create one with all variables
          seedNonSystemMessages.push({ role: "user", content: variableKeys.map((v) => `{{${v}}}`).join("\n") });
        }

        // Create a prompt version (deploy flag in POST body per docs)
        async function createVersion(systemContent: string, deploy = false): Promise<{ id: string; version: number }> {
          const res = (await callKeywordsAI(apiKey, "POST", `${BASE}/api/prompts/${promptId}/versions/`, {
            messages: [
              { role: "system", content: systemContent },
              ...seedNonSystemMessages,
            ],
            model: taskModel,
            ...(deploy ? { deploy: true } : {}),
          })) as { id: string; version: number };

          return res;
        }

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        // Run an experiment and wait for BOTH completion AND evaluator scores.
        // Assumes the target version was already created with deploy: true.
        async function runExperiment(
          gen: number,
          total: number,
          label: string,
        ): Promise<{
          scores: Record<number, number>;
          meanScore: number;
          avgCost: number;
          outputs: Record<number, string>;
        }> {
          // 1. Create experiment (version was deployed at creation; next version will lock it)
          send({ type: "generation", gen, total, step: "experiment", message: "Creating experiment..." });
          const expRes = (await callKeywordsAI(apiKey, "POST", `${BASE}/api/v2/experiments/`, {
            name: `GEPA - ${label}`,
            dataset_id: datasetId,
            workflow: [{ type: "prompt", config: { prompt_id: promptId } }],
            evaluator_slugs: [evaluatorSlug],
          })) as Record<string, unknown>;
          const experimentId = String(expRes.id ?? expRes.experiment_id ?? expRes.unique_id ?? "");
          if (!experimentId) throw new Error(`Failed to create experiment: ${JSON.stringify(expRes)}`);
          send({ type: "generation", gen, total, step: "experiment", message: `Experiment created: ${experimentId}` });

          // 3. Poll experiment status until completed (LLM calls done)
          send({ type: "generation", gen, total, step: "poll", message: "Waiting for experiment to run..." });
          const maxPollMs = 180_000; // 3 minutes
          const pollStart = Date.now();
          let expData: Record<string, unknown> = {};
          while (Date.now() - pollStart < maxPollMs) {
            await sleep(5000);
            expData = (await callKeywordsAI(apiKey, "GET", `${BASE}/api/v2/experiments/${experimentId}/`)) as Record<string, unknown>;
            const st = String(expData.status ?? "");
            send({ type: "generation", gen, total, step: "poll", message: `Experiment status: ${st}` });
            if (st === "completed" || st === "done") break;
            if (st === "failed" || st === "error") {
              throw new Error(`Experiment failed: ${JSON.stringify(expData)}`);
            }
          }
          const finalStatus = String(expData.status ?? "");
          if (finalStatus !== "completed" && finalStatus !== "done") {
            throw new Error(`Experiment timed out (status: ${finalStatus})`);
          }

          // 4. Wait for logs to appear (they may lag behind experiment completion)
          send({ type: "generation", gen, total, step: "scores", message: "Waiting for experiment logs..." });

          const scores: Record<number, number> = {};
          const outputs: Record<number, string> = {};
          let totalCost = 0;
          let numRequests = 0;

          // Poll logs list until logs appear (experiment may be "completed" before logs are written)
          let logs: Array<Record<string, unknown>> = [];
          for (let logPoll = 0; logPoll < 20; logPoll++) {
            await sleep(5000);
            const logsList = (await callKeywordsAI(
              apiKey, "GET", `${BASE}/api/v2/experiments/${experimentId}/logs/list/`,
            )) as { results?: Array<Record<string, unknown>> };
            logs = logsList.results ?? [];
            if (logs.length > 0) break;
            send({ type: "generation", gen, total, step: "scores", message: `Waiting for logs to appear (${logPoll + 1})...` });
          }
          numRequests = logs.length || testCases.length;
          send({ type: "generation", gen, total, step: "scores", message: `Found ${logs.length} experiment logs, checking scores...` });

          for (let i = 0; i < logs.length && i < testCases.length; i++) {
            const logEntry = logs[i];
            const logId = String(logEntry.id ?? logEntry.unique_id ?? logEntry.trace_id ?? "");
            if (!logId) continue;

            // Poll individual log until scores appear (evaluators are async)
            let detail: Record<string, unknown> = {};
            let logScores: Record<string, unknown> | null = null;
            for (let attempt = 0; attempt < 15; attempt++) {
              detail = (await callKeywordsAI(
                apiKey, "GET",
                `${BASE}/api/v2/experiments/${experimentId}/logs/${logId}/`,
              )) as Record<string, unknown>;

              const rawScores = detail.scores as Record<string, unknown> | undefined;
              if (rawScores && Object.keys(rawScores).length > 0) {
                logScores = rawScores;
                break;
              }
              if (attempt < 14) {
                send({ type: "generation", gen, total, step: "scores", message: `Log ${i + 1}/${logs.length}: waiting for score (${attempt + 1})...` });
                await sleep(3000);
              }
            }

            // Extract score from first evaluator
            if (logScores) {
              const firstEval = Object.values(logScores)[0] as Record<string, unknown> | undefined;
              const sv = firstEval?.score_value ?? firstEval?.numerical_value ?? firstEval?.value ?? 0;
              scores[i] = Math.min(10, Math.max(0, typeof sv === "number" ? sv : parseFloat(String(sv)) || 0));
            } else {
              scores[i] = 0;
              send({ type: "generation", gen, total, step: "scores", message: `Log ${i + 1}: no score after polling` });
            }

            // Extract output
            outputs[i] = extractOutputText(detail.output);

            // Accumulate cost from individual log
            const logCost = typeof detail.cost === "number" ? detail.cost : parseFloat(String(detail.cost ?? "0")) || 0;
            totalCost += logCost;
          }

          // Also try summary endpoint for cost if individual costs were 0
          if (totalCost === 0) {
            try {
              const summary = (await callKeywordsAI(
                apiKey, "GET", `${BASE}/api/v2/experiments/${experimentId}/logs/summary/`,
              )) as Record<string, unknown>;
              totalCost = typeof summary.total_cost === "number" ? summary.total_cost : 0;
              numRequests = typeof summary.number_of_requests === "number" ? summary.number_of_requests : numRequests;
            } catch {
              // summary endpoint is optional
            }
          }

          const vals = Object.values(scores);
          const meanScore = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          const avgCost = numRequests > 0 ? totalCost / numRequests : 0;

          send({ type: "generation", gen, total, step: "scores", message: `Scores collected: mean ${meanScore.toFixed(1)}/10` });
          return { scores, meanScore, avgCost, outputs };
        }

        // ---------------------------------------------------------------
        // Phase 2 — GEPA Loop
        // ---------------------------------------------------------------

        const candidates: ParetoEntry[] = [];

        // Evaluate seed (v1) — already deployed at creation
        send({ type: "generation", gen: 0, total: iterations, step: "evaluate", message: "Evaluating seed prompt..." });
        const seedEval = await runExperiment(0, iterations, `Seed - ${taskDescription.slice(0, 40)}`);
        candidates.push({
          versionNumber: v1Res.version ?? 1,
          promptText: initialPrompt,
          scores: seedEval.scores,
          meanScore: seedEval.meanScore,
          avgCost: seedEval.avgCost,
          actualOutputs: seedEval.outputs,
        });
        send({
          type: "generation",
          gen: 0,
          total: iterations,
          step: "done",
          message: `Seed — score: ${seedEval.meanScore.toFixed(1)}/10, cost: $${(seedEval.avgCost * 1000).toFixed(2)}/1k`,
          score: seedEval.meanScore,
          cost: seedEval.avgCost,
          promptText: initialPrompt,
        });

        const seedScore = seedEval.meanScore;

        // Iteration loop
        for (let gen = 1; gen <= iterations; gen++) {
          send({ type: "generation", gen, total: iterations, step: "start", message: `Generation ${gen}/${iterations}` });

          // Pareto frontier & parent selection
          const frontier = computeParetoFrontier(candidates);
          const parent = sampleFromFrontier(frontier);

          // Failing test cases (score < 8)
          const failingCases = Object.entries(parent.scores)
            .filter(([, score]) => score < 8)
            .map(([idx, score]) => ({
              input: JSON.stringify(testCases[Number(idx)]?.input ?? {}),
              expectedOutput: testCases[Number(idx)]?.expected_output ?? "",
              actualOutput: parent.actualOutputs[Number(idx)] ?? "",
              score,
            }));

          // Reflect via Gateway
          send({ type: "generation", gen, total: iterations, step: "reflect", message: "Reflecting on failures..." });
          const reflectionPrompt = `You are an expert prompt engineer. Analyze the following prompt's performance and create an improved version.

## Current Prompt
${parent.promptText}

## Task Description
${taskDescription}

## Failing Test Cases
${
  failingCases.length > 0
    ? failingCases
        .map(
          (fc, i) =>
            `### Case ${i + 1}\n- Input: ${fc.input}\n- Expected: ${fc.expectedOutput}\n- Actual Output: ${fc.actualOutput}\n- Score: ${fc.score}/10`,
        )
        .join("\n\n")
    : "All test cases passed with high scores. Try to improve further."
}

## Instructions
1. Analyze why the prompt failed on these cases
2. Identify specific weaknesses
3. Propose a concrete improved prompt

Respond with JSON only: { "analysis": "...", "improved_prompt": "..." }`;

          const reflectionResult = await callGateway(apiKey, {
            model: reflectionModel,
            messages: [{ role: "user", content: reflectionPrompt }],
            temperature: 0.7,
            max_tokens: 2048,
          });

          let mutatedPrompt: string;
          let analysis = "";
          try {
            const parsed = JSON.parse(extractJSON(reflectionResult.content));
            mutatedPrompt = parsed.improved_prompt ?? parsed.improvedPrompt ?? initialPrompt;
            analysis = parsed.analysis ?? "";
          } catch {
            mutatedPrompt = reflectionResult.content;
          }

          send({ type: "generation", gen, total: iterations, step: "mutate", message: `Reflection: ${analysis.slice(0, 120)}...` });

          // Create new prompt version with mutated prompt AND deploy it
          send({ type: "generation", gen, total: iterations, step: "version", message: "Creating new prompt version..." });
          const newVersion = await createVersion(mutatedPrompt, true);

          // Evaluate via experiment — version is already deployed
          send({ type: "generation", gen, total: iterations, step: "evaluate", message: "Evaluating via experiment..." });
          const evalResult = await runExperiment(gen, iterations, `Gen ${gen} - ${taskDescription.slice(0, 40)}`);
          candidates.push({
            versionNumber: newVersion.version,
            promptText: mutatedPrompt,
            scores: evalResult.scores,
            meanScore: evalResult.meanScore,
            avgCost: evalResult.avgCost,
            actualOutputs: evalResult.outputs,
          });

          send({
            type: "generation",
            gen,
            total: iterations,
            step: "done",
            message: `Gen ${gen} — score: ${evalResult.meanScore.toFixed(1)}/10, cost: $${(evalResult.avgCost * 1000).toFixed(2)}/1k`,
            score: evalResult.meanScore,
            cost: evalResult.avgCost,
            promptText: mutatedPrompt,
          });
        }

        // ---------------------------------------------------------------
        // Phase 3 — Final
        // ---------------------------------------------------------------

        const finalFrontier = computeParetoFrontier(candidates);
        const best = candidates.reduce((a, b) => (a.meanScore >= b.meanScore ? a : b));

        const stripOutputs = (entries: ParetoEntry[]) =>
          entries.map(({ actualOutputs, ...rest }) => rest) as ParetoEntry[];

        send({
          type: "complete",
          bestVersion: best.versionNumber,
          bestScore: best.meanScore,
          bestPrompt: best.promptText,
          seedScore,
          paretoFrontier: stripOutputs(finalFrontier),
          allCandidates: stripOutputs(candidates),
          promptId,
          datasetId,
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
