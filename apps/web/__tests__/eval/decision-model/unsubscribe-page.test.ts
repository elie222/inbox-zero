import { afterAll, describe, test } from "vitest";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { checkUnsubscribePageStateWithLlm } from "@/utils/ai/senders/unsubscribe-page";
import { decideUnsubscribePageState } from "@/utils/decision-model/unsubscribe-page";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

const cases = [
  {
    name: "explicit completion",
    pageText:
      "Unsubscribed. Your address has been removed and you will receive no more messages.",
    expected: "confirmed" as const,
  },
  {
    name: "past-tense removal acknowledgement",
    pageText: "You have successfully been removed from the mailing list.",
    expected: "confirmed" as const,
  },
  {
    name: "confirmation button still required",
    pageText: "To unsubscribe, click the Confirm Unsubscribe button below.",
    expected: "not_confirmed" as const,
  },
  {
    name: "preference form",
    pageText:
      "Manage your email preferences. Select the messages you want to receive, then save changes.",
    expected: "not_confirmed" as const,
  },
  {
    name: "error page",
    pageText: "Something went wrong. Please try again or complete the CAPTCHA.",
    expected: "not_confirmed" as const,
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model unsubscribe page",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-unsubscribe-page",
    });

    for (const testCase of cases) {
      test(
        testCase.name,
        async () => {
          await compareDecision({
            testName: testCase.name,
            expected: testCase.expected,
            runJev: () =>
              decideUnsubscribePageState({
                config: decisionModelConfig,
                pageText: testCase.pageText,
                emailAccount: lunaEmailAccount,
                logger: decisionModelEvalLogger,
              }),
            runLuna: () =>
              checkUnsubscribePageStateWithLlm({
                pageText: testCase.pageText,
                emailAccount: lunaEmailAccount,
              }),
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    afterAll(() => reporter.printReport());
  },
);
