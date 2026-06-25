const outputQualitySnippet = `def main(eval_inputs):
    output = eval_inputs.get('output', '')
    text = str(output).strip()
    return 10.0 if text else 0.0`;

const expectedMatchSnippet = `def main(eval_inputs):
    output = str(eval_inputs.get('output', '')).lower()
    expected = str(eval_inputs.get('expected_output', '')).lower().strip()
    if not expected:
        return 7.0 if output.strip() else 0.0
    return 10.0 if expected in output else 5.0`;

function nodeId(prefix: string, name: string) {
  return `${prefix}_${name}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function buildFullEvaluatorWorkflowTasks(prefix: string) {
  const qualityId = nodeId(prefix, "output_quality_eval");
  const expectedId = nodeId(prefix, "expected_match_eval");
  const baselineId = nodeId(prefix, "baseline_score");
  const finalId = nodeId(prefix, "final_weighted_score");

  return [
    {
      id: qualityId,
      type: "eval",
      label: "Output quality score",
      generation_method: "code",
      config: {
        name: "Output quality score",
        generation_method: "code",
        score_value_type: "numerical",
        score_config: { min_score: 0, max_score: 10 },
        code_config: { eval_code_snippet: outputQualitySnippet },
        is_auto_persist_enabled: true,
        _blockly_hidden_eval: true,
        _blockly_node_id: qualityId,
        _blockly_output_field: "primary_score",
        _blockly_is_result: false,
        _blockly_evaluator_kind: "code",
      },
    },
    {
      id: expectedId,
      type: "eval",
      label: "Expected match score",
      generation_method: "code",
      config: {
        name: "Expected match score",
        generation_method: "code",
        score_value_type: "numerical",
        score_config: { min_score: 0, max_score: 10 },
        code_config: { eval_code_snippet: expectedMatchSnippet },
        is_auto_persist_enabled: true,
        _blockly_hidden_eval: true,
        _blockly_node_id: expectedId,
        _blockly_output_field: "primary_score",
        _blockly_is_result: false,
        _blockly_evaluator_kind: "code",
      },
    },
    {
      id: baselineId,
      type: "transform",
      label: "Baseline score",
      config: {
        transform_type: "constant",
        output_contract: "score_fields",
        params: { value: 8.0 },
      },
    },
    {
      id: finalId,
      type: "compute",
      label: "Final weighted score",
      config: {
        function: "weighted_average",
        inputs: [
          { source: `state.${qualityId}`, field: "primary_score", weight: 0.55 },
          { source: `state.${expectedId}`, field: "primary_score", weight: 0.35 },
          { source: `state.${baselineId}`, field: "primary_score", weight: 0.10 },
        ],
        label: "Final weighted score",
      },
    },
  ];
}

export function buildFullEvaluatorWorkflowPayload(namePrefix: string, description: string, prefix: string) {
  const stamp = new Date().toISOString();
  return {
    name: `${namePrefix} (${stamp})`,
    description,
    tasks: buildFullEvaluatorWorkflowTasks(prefix),
  };
}
