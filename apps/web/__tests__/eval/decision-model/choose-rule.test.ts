import { afterAll, describe, test } from "vitest";
import { getEmail, getMockMessage } from "@/__tests__/helpers";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { checkColdEmailWithLlm } from "@/utils/cold-email/is-cold-email";
import { decisionModelChooseRule } from "@/utils/decision-model/choose-rule";
import type { ParsedMessage } from "@/utils/types";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/decision-model/choose-rule.test.ts

const rules = [
  {
    id: "receipts",
    name: "Receipts",
    instructions: "Purchase receipts, invoices, and payment confirmations",
  },
  {
    id: "newsletters",
    name: "Newsletters",
    instructions: "Editorial newsletters and recurring digests",
  },
  {
    id: "support",
    name: "Customer Support",
    instructions: "Customer questions, product problems, and support requests",
  },
  {
    id: "needs-reply",
    name: "Needs Reply",
    instructions: "Messages that explicitly ask the account owner to respond",
  },
];

const singleRuleCases = [
  {
    name: "receipt",
    email: getEmail({
      from: "billing@merchant.example",
      subject: "Receipt for order #1234",
      content: "Payment received. Your total was $29.00.",
    }),
    expected: ["Receipts"],
  },
  {
    name: "newsletter",
    email: getEmail({
      from: "digest@publication.example",
      subject: "This week's engineering digest",
      content: "Five engineering stories and three useful links for your week.",
      listUnsubscribe: "https://publication.example/unsubscribe",
    }),
    expected: ["Newsletters"],
  },
  {
    name: "no matching rule",
    email: getEmail({
      from: "alex@example.com",
      subject: "Photos from Saturday",
      content: "Here are the photos. No need to reply.",
    }),
    expected: [],
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model choose rule",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-choose-rule",
    });

    for (const testCase of singleRuleCases) {
      test(
        testCase.name,
        async () => {
          await compareRuleSelection({
            testName: testCase.name,
            email: testCase.email,
            expected: testCase.expected,
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    test(
      "folds cold-email classification into rule choice",
      async () => {
        const email = getEmail({
          from: "sales@agency.example",
          subject: "Can we grow your pipeline?",
          content:
            "We have never met, but our agency can book qualified meetings for your company. Want a sales call?",
        });

        await compareDecision({
          testName: "cold email folded into choose rule",
          expected: true,
          runJev: async () =>
            (
              await decisionModelChooseRule({
                decisionModel: decisionModelConfig,
                message: toParsedMessage(email),
                emailAccount: lunaEmailAccount,
                rules,
                coldEmailRule: { instructions: "" },
                classificationFeedback: null,
                logger: decisionModelEvalLogger,
              })
            ).isColdEmail,
          runLuna: async () =>
            (
              await checkColdEmailWithLlm({
                email,
                emailAccount: lunaEmailAccount,
                coldEmailRule: null,
                logger: decisionModelEvalLogger,
              })
            ).isColdEmail,
          reporter,
        });
      },
      DECISION_MODEL_EVAL_TIMEOUT,
    );

    afterAll(() => reporter.printReport());
  },
);

async function compareRuleSelection({
  testName,
  email,
  expected,
  reporter,
}: {
  testName: string;
  email: ReturnType<typeof getEmail>;
  expected: string[];
  reporter: ReturnType<typeof createEvalReporter>;
}) {
  await compareDecision({
    testName,
    expected,
    runJev: async () =>
      (
        await decisionModelChooseRule({
          decisionModel: decisionModelConfig,
          message: toParsedMessage(email),
          emailAccount: lunaEmailAccount,
          rules,
          coldEmailRule: null,
          classificationFeedback: null,
          logger: decisionModelEvalLogger,
        })
      ).rules
        .map(({ rule }) => rule.name)
        .sort(),
    runLuna: async () =>
      (
        await aiChooseRule({
          email,
          emailAccount: lunaEmailAccount,
          rules,
          logger: decisionModelEvalLogger,
        })
      ).rules
        .map(({ rule }) => rule.name)
        .sort(),
    reporter,
  });
}

function toParsedMessage(email: ReturnType<typeof getEmail>) {
  return getMockMessage({
    from: email.from,
    to: email.to,
    subject: email.subject,
    textPlain: email.content,
    listUnsubscribe: email.listUnsubscribe,
  }) as unknown as ParsedMessage;
}
