import { afterAll, describe, test } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { detectRecurringPatternWithLlmStrict } from "@/utils/ai/choose-rule/ai-detect-recurring-pattern";
import { decideRecurringPattern } from "@/utils/decision-model/recurring-pattern";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

const rules = [
  { name: "Receipts", instructions: "Payment confirmations and receipts" },
  { name: "Newsletters", instructions: "Editorial newsletters and digests" },
];

const cases = [
  {
    name: "consistent receipt sender",
    expected: "Receipts",
    consistentRuleName: "Receipts",
    emails: [20, 35, 18].map((total, index) =>
      getEmail({
        from: "receipts@payments.example",
        subject: `Receipt #100${index}`,
        content: `Payment received. Total: $${total}.`,
      }),
    ),
  },
  {
    name: "consistent newsletter sender",
    expected: "Newsletters",
    consistentRuleName: "Newsletters",
    emails: ["Monday", "Tuesday", "Wednesday"].map((day) =>
      getEmail({
        from: "digest@publication.example",
        subject: `${day} engineering digest`,
        content: "Today's editorial roundup and curated engineering links.",
        listUnsubscribe: "https://publication.example/unsubscribe",
      }),
    ),
  },
  {
    name: "varied personal sender",
    expected: null,
    consistentRuleName: "Receipts",
    emails: [
      getEmail({
        from: "alex@example.com",
        subject: "Dinner",
        content: "Are you free for dinner Friday?",
      }),
      getEmail({
        from: "alex@example.com",
        subject: "Shared trip invoice",
        content: "Here is the invoice from our shared trip.",
      }),
      getEmail({
        from: "alex@example.com",
        subject: "Introduction",
        content: "Meet my colleague Sam.",
      }),
    ],
  },
  {
    name: "mixed-purpose service sender",
    expected: null,
    consistentRuleName: undefined,
    emails: [
      getEmail({
        from: "updates@service.example",
        subject: "Your payment receipt",
        content: "Payment received. Total: $20.",
      }),
      getEmail({
        from: "updates@service.example",
        subject: "Five product tips",
        content: "Our editorial roundup of product tips.",
      }),
      getEmail({
        from: "updates@service.example",
        subject: "Security alert",
        content: "A new device signed into your account.",
      }),
    ],
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model recurring pattern",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-recurring-pattern",
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
                await decideRecurringPattern({
                  config: decisionModelConfig,
                  emails: testCase.emails,
                  emailAccount: lunaEmailAccount,
                  rules,
                  consistentRuleName: testCase.consistentRuleName,
                  logger: decisionModelEvalLogger,
                })
              ).matchedRule,
            runLuna: async () =>
              (
                await detectRecurringPatternWithLlmStrict({
                  emails: testCase.emails,
                  emailAccount: lunaEmailAccount,
                  rules,
                  consistentRuleName: testCase.consistentRuleName,
                })
              )?.matchedRule ?? null,
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    afterAll(() => reporter.printReport());
  },
);
