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
].map((systemType) => {
  let instructions = getRuleConfig(systemType).instructions;
  if (systemType === SystemType.FYI)
    instructions =
      "Informational messages where I am copied in CC. Never apply when I am a direct recipient in To, even when there are multiple direct recipients and no action is requested.";
  if (systemType === SystemType.ACTIONED)
    instructions =
      "Apply only when the latest message is addressed directly to me and clearly concludes or fulfills something I previously requested. Never apply to copied recipients or to messages that merely contain information.";
  return { systemType, instructions };
});

const cases = [
  {
    name: "informational mail to multiple direct recipients",
    to: `${lunaEmailAccount.email}, colleague@example.com`,
    cc: "",
    content:
      "Attached is the updated contract for your information. No response is needed.",
    expected: null,
  },
  {
    name: "empty mail to the account owner",
    to: lunaEmailAccount.email,
    cc: "",
    content: "",
    expected: null,
  },
  {
    name: "Polish informational mail excludes direct recipients",
    to: `${lunaEmailAccount.email}, colleague@example.com`,
    cc: "",
    content:
      "Przesyłam poprawioną umowę do wiadomości. Nie jest wymagana odpowiedź.",
    expected: null,
  },
  {
    name: "copied recipient remains eligible despite quoted direct headers",
    to: "colleague@example.com",
    cc: lunaEmailAccount.email,
    content: `For your information, the update is complete. No response needed.\n\n---------- Forwarded message ----------\nTo: ${lunaEmailAccount.email}\nThe earlier update was received.`,
    expected: SystemType.FYI,
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: conversation status exclusions",
  () => {
    const reporter = createEvalReporter({
      evalName: "thread-status-exclusions",
    });
    for (const testCase of cases) {
      test(
        testCase.name,
        async () => {
          const threadMessages = [
            getEmail({
              from: "sender@example.com",
              to: testCase.to,
              cc: testCase.cc,
              content: testCase.content,
            }),
          ];
          const runLlm = () =>
            determineThreadStatusWithLlm({
              emailAccount: lunaEmailAccount,
              definitions,
              threadMessages,
              userSentLastEmail: false,
            });
          await compareDecision({
            testName: testCase.name,
            expected: testCase.expected,
            reporter,
            runJev: async () => {
              try {
                return (
                  await decideThreadStatus({
                    config: decisionModelConfig,
                    emailAccount: lunaEmailAccount,
                    definitions,
                    threadMessages,
                    userSentLastEmail: false,
                    logger: decisionModelEvalLogger,
                  })
                ).status;
              } catch (error) {
                if (
                  !(error instanceof Error) ||
                  !error.message.includes("confidence is too low")
                )
                  throw error;
                return (await runLlm()).status;
              }
            },
            runLuna: async () => (await runLlm()).status,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }
    test(
      "returns no match when the only definition excludes the message",
      async () => {
        const eligibleDefinitions = definitions.filter(
          (definition) => definition.systemType === SystemType.FYI,
        );
        const threadMessages = [
          getEmail({
            from: "sender@example.com",
            to: lunaEmailAccount.email,
            content: "Informational update, no reply needed.",
          }),
        ];
        await compareDecision({
          testName: "no eligible definition",
          expected: null,
          reporter,
          runJev: async () =>
            (
              await decideThreadStatus({
                config: decisionModelConfig,
                emailAccount: lunaEmailAccount,
                definitions: eligibleDefinitions,
                threadMessages,
                userSentLastEmail: false,
                logger: decisionModelEvalLogger,
              })
            ).status,
          runLuna: async () =>
            (
              await determineThreadStatusWithLlm({
                emailAccount: lunaEmailAccount,
                definitions: eligibleDefinitions,
                threadMessages,
                userSentLastEmail: false,
              })
            ).status,
        });
      },
      DECISION_MODEL_EVAL_TIMEOUT,
    );
    afterAll(() => reporter.printReport());
  },
);
