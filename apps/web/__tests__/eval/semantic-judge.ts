import {
  judgeBinary,
  type JudgeCriterion,
  type JudgeResult,
} from "@/__tests__/eval/judge";

const DEFAULT_EVAL_JUDGE_PROVIDER = "openrouter";
const DEFAULT_EVAL_JUDGE_MODEL = "google/gemini-3.1-flash-lite-preview";

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
  const aiProvider =
    process.env.EVAL_JUDGE_PROVIDER || DEFAULT_EVAL_JUDGE_PROVIDER;
  const aiModel = process.env.EVAL_JUDGE_MODEL || DEFAULT_EVAL_JUDGE_MODEL;
  const aiApiKey = getEvalJudgeApiKey(aiProvider);
  if (!aiApiKey) return undefined;

  return {
    aiProvider,
    aiModel,
    aiApiKey,
  };
}

function getEvalJudgeApiKey(provider: string) {
  const providerApiKeys: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };

  return providerApiKeys[provider];
}
