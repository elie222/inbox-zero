import { createHash } from "node:crypto";
import { buildJudgeSystemPrompt } from "@/__tests__/eval/harness/send-ready-judge-contract";
import { getModel } from "@/utils/llms/model";
import { getEvalJudgeUserAi } from "@/__tests__/eval/judge-provider";

/**
 * Eval matrices can include models from any family, including the judge's.
 * Override EVAL_JUDGE_PROVIDER / EVAL_JUDGE_MODEL when a run needs a different
 * or independently calibrated cross-family judge.
 */
export function getHarnessJudgeModel() {
  const judgeUserAi = getEvalJudgeUserAi();
  if (!judgeUserAi) {
    throw new Error(
      "No API key for the eval judge provider. Set OPENROUTER_API_KEY, or EVAL_JUDGE_PROVIDER with the matching key.",
    );
  }
  return getModel(judgeUserAi);
}

/**
 * Identifies the judge for cache keying: its model and its rubric. A cached
 * verdict is that judge's opinion, so reusing it after either changed would
 * report an opinion nothing currently holds.
 */
export function getJudgeFingerprint(): string {
  const judgeUserAi = getEvalJudgeUserAi();
  return createHash("sha256")
    .update(
      JSON.stringify([
        judgeUserAi?.aiProvider ?? "none",
        judgeUserAi?.aiModel ?? "none",
        buildJudgeSystemPrompt(),
      ]),
    )
    .digest("hex")
    .slice(0, 16);
}
