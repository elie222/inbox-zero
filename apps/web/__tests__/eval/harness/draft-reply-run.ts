import { runDraftReplyAssertions } from "@/__tests__/eval/harness/assertions";
import { judgeCriteria } from "@/__tests__/eval/harness/criteria-judge";
import {
  describeContext,
  describeThread,
  invokeDraftReply,
} from "@/__tests__/eval/harness/draft-reply-adapter";
import type { DraftReplyCase } from "@/__tests__/eval/harness/draft-reply-schema";
import {
  runEvalSuite,
  type EvalFilters,
  type EvalResultRecord,
  type EvalRun,
} from "@/__tests__/eval/harness/run-suite";
import { judgeSendReady } from "@/__tests__/eval/harness/send-ready-judge";
import { getJudgeFingerprint } from "@/__tests__/eval/harness/judge-model";
import { contentHashForCase } from "@/__tests__/eval/harness/split-lock";
import type { EmailAccountWithAI } from "@/utils/llms/types";

/**
 * The full draft-reply grading pipeline: real drafting call, named assertions,
 * per-case criteria, send-ready verdict.
 *
 * Shared rather than reconstructed per caller because an ablation compares two
 * runs against each other. If the baseline arm and an ablated arm were graded by
 * two copies of this wiring, any drift between them would show up as an effect
 * size, and there is nothing in the output that would reveal it.
 *
 * The judge sees `describeContext` of the case it was given, so an ablated arm
 * is judged against the context the model actually had. That is the point: a
 * commitment the calendar no longer supports should be graded as unsupported.
 */
export function runDraftReplyEval<
  TCase extends DraftReplyCase & { __sourceRoot?: string },
>({
  evalName,
  cases,
  emailAccount,
  model,
  variantId,
  samples,
  concurrency,
  filters,
  writeHistory,
  onRecord,
}: {
  evalName: string;
  cases: TCase[];
  emailAccount: EmailAccountWithAI;
  model: string;
  variantId?: string;
  samples?: number;
  concurrency?: number;
  filters?: EvalFilters;
  writeHistory?: boolean;
  onRecord?: (record: EvalResultRecord) => void;
}): Promise<EvalRun> {
  return runEvalSuite({
    evalName,
    cases,
    model,
    variantId,
    samples,
    concurrency,
    filters,
    writeHistory,
    onRecord,
    invoke: ({ evalCase }) => invokeDraftReply({ evalCase, emailAccount }),
    assert: ({ evalCase, output }) =>
      runDraftReplyAssertions({
        assertions: evalCase.assertions,
        output,
        input: evalCase.input,
      }),
    judge: async ({ evalCase, output, signal }) => {
      const inboundThread = describeThread(evalCase);
      const context = describeContext(evalCase);

      const [criteria, verdict] = await Promise.all([
        judgeCriteria({
          inboundThread,
          draft: output.reply,
          criteria: evalCase.judgeCriteria,
          groundTruth: evalCase.expectedGroundTruth,
          context,
          signal,
        }),
        judgeSendReady({
          inboundThread,
          draft: output.reply,
          groundTruth: evalCase.expectedGroundTruth,
          context,
          signal,
        }),
      ]);

      return {
        sendReady: verdict.sendReady,
        usability: verdict.usability,
        primaryIssue: verdict.primaryIssue,
        severity: verdict.severity,
        reasoning: verdict.reasoning,
        criteriaFailures: criteria.failures,
      };
    },
    describeOutput: (output) => output.reply,
    confidenceOf: (output) => output.confidence,
    caseFingerprintOf: (evalCase) => contentHashForCase(evalCase),
    judgeFingerprint: getJudgeFingerprint(),
  });
}
