import {
  judgeBinary,
  type JudgeCriterion,
  type JudgeResult,
} from "@/__tests__/eval/judge";

export async function judgeEvalOutput({
  criterion,
  expected,
  input,
  output,
}: {
  criterion: JudgeCriterion;
  expected?: string;
  input: string;
  output: string;
}) {
  return judgeBinary({
    input,
    output,
    expected,
    criterion,
    judgeUserAi: getEvalJudgeUserAi(),
  });
}

export function formatSemanticJudgeActual(
  output: string,
  judgeResult: Pick<JudgeResult, "pass" | "reasoning">,
) {
  return [
    `output=${JSON.stringify(output)}`,
    `judge=${judgeResult.pass ? "PASS" : "FAIL"} (${judgeResult.reasoning})`,
  ].join(" | ");
}

export function getEvalJudgeUserAi() {
  if (!process.env.OPENROUTER_API_KEY) return undefined;

  return {
    aiProvider: "openrouter",
    aiModel: "google/gemini-3.1-flash-lite-preview",
    aiApiKey: process.env.OPENROUTER_API_KEY,
  };
}
