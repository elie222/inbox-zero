import { createHash } from "node:crypto";
import { buildJudgeSystemPrompt } from "@/__tests__/eval/harness/send-ready-judge-contract";
import { getModel } from "@/utils/llms/model";
import { getEvalJudgeUserAi } from "@/__tests__/eval/judge-provider";

/**
 * The judge is deliberately from a different model family than the system under
 * test. A same-family judge exhibits self-preference bias: it recognises its own
 * generation style, hedging habits, and sentence rhythm as "good writing", so it
 * passes drafts a human would rewrite. That bias points in exactly the direction
 * this harness exists to eliminate, and it is unobservable from inside the run
 * because a lenient judge just reports a high number.
 *
 * The default (`google/gemini-3.1-flash-lite-preview`) is set by
 * `getEvalJudgeUserAi` and overridable with EVAL_JUDGE_PROVIDER /
 * EVAL_JUDGE_MODEL.
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
