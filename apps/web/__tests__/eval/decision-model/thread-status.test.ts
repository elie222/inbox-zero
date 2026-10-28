import { afterAll, describe, test } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { SystemType } from "@/generated/prisma/enums";
import { determineThreadStatusWithLlm } from "@/utils/ai/reply/determine-thread-status";
import { decideThreadStatus } from "@/utils/decision-model/thread-status";
import { getRuleConfig } from "@/utils/rule/consts";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

const definitions = [
  SystemType.TO_REPLY,
  SystemType.AWAITING_REPLY,
  SystemType.FYI,
  SystemType.ACTIONED,
].map((systemType) => ({
  systemType,
  instructions: getRuleConfig(systemType).instructions,
}));

const cases = [
  {
    name: "explicit incoming request",
    expected: SystemType.TO_REPLY,
    userSentLastEmail: false,
    messages: [
      getEmail({
        from: "customer@example.com",
        to: lunaEmailAccount.email,
        content: "Can you send the updated proposal by Friday?",
      }),
    ],
  },
  {
    name: "waiting on another participant",
    expected: SystemType.AWAITING_REPLY,
    userSentLastEmail: true,
    messages: [
      getEmail({
        from: lunaEmailAccount.email,
        to: "vendor@example.com",
        content: "Can you confirm when the replacement will ship?",
      }),
    ],
  },
  {
    name: "informational update",
    expected: SystemType.FYI,
    userSentLastEmail: false,
    messages: [
      getEmail({
        from: "ops@example.com",
        to: lunaEmailAccount.email,
        content:
          "For your information, the maintenance completed successfully.",
      }),
    ],
  },
  {
    name: "request fulfilled",
    expected: SystemType.ACTIONED,
    userSentLastEmail: false,
    messages: [
      getEmail({
        from: lunaEmailAccount.email,
        to: "vendor@example.com",
        content: "Could you send me the signed contract?",
      }),
      getEmail({
        from: "vendor@example.com",
        to: lunaEmailAccount.email,
        content: "Attached is the signed contract you requested.",
      }),
    ],
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model thread status",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-thread-status",
    });

    for (const testCase of cases) {
      test(
        testCase.name,
        async () => {
          await compareDecision({
            testName: testCase.name,
            expected: testCase.expected,
            runJev: async () =>
              (
                await decideThreadStatus({
                  config: decisionModelConfig,
                  emailAccount: lunaEmailAccount,
                  definitions,
                  threadMessages: testCase.messages,
                  userSentLastEmail: testCase.userSentLastEmail,
                  logger: decisionModelEvalLogger,
                })
              ).status,
            runLuna: async () =>
              (
                await determineThreadStatusWithLlm({
                  emailAccount: lunaEmailAccount,
                  definitions,
                  threadMessages: testCase.messages,
                  userSentLastEmail: testCase.userSentLastEmail,
                })
              ).status,
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    afterAll(() => reporter.printReport());
  },
);
