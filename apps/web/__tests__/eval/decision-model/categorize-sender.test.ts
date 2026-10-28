import { afterAll, describe, test } from "vitest";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { categorizeSenderWithLlm } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { categorizeSendersWithLlm } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import {
  decideBulkSenderCategories,
  decideSenderCategory,
} from "@/utils/decision-model/categorize-sender";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

const categories = [
  { name: "Newsletter", description: "Editorial subscription email" },
  { name: "Receipt", description: "Purchase receipt or invoice" },
  { name: "Notification", description: "Automated account or service alert" },
];

const singleCases = [
  {
    name: "single receipt sender",
    sender: "billing@merchant.example",
    emails: [{ subject: "Your receipt", snippet: "Order total: $29.00" }],
    expected: "Receipt",
  },
  {
    name: "single newsletter sender",
    sender: "digest@publication.example",
    emails: [
      {
        subject: "Weekly engineering digest",
        snippet: "This week's editorial stories and links",
      },
    ],
    expected: "Newsletter",
  },
  {
    name: "ambiguous personal sender",
    sender: "friend@example.com",
    emails: [{ subject: "Dinner Friday?", snippet: "Are you free at 7?" }],
    expected: null,
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model sender categorization",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-categorize-sender",
    });

    for (const testCase of singleCases) {
      test(
        testCase.name,
        async () => {
          await compareDecision({
            testName: testCase.name,
            expected: testCase.expected,
            runJev: async () =>
              (
                await decideSenderCategory({
                  config: decisionModelConfig,
                  emailAccount: lunaEmailAccount,
                  sender: testCase.sender,
                  previousEmails: testCase.emails,
                  categories,
                  logger: decisionModelEvalLogger,
                })
              )?.category ?? null,
            runLuna: async () =>
              (
                await categorizeSenderWithLlm({
                  emailAccount: lunaEmailAccount,
                  sender: testCase.sender,
                  previousEmails: testCase.emails,
                  categories,
                })
              )?.category ?? null,
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    test(
      "categorizes multiple senders in one decision",
      async () => {
        const senders = [
          {
            emailAddress: "billing@merchant.example",
            emails: [
              { subject: "Your receipt", snippet: "Order total: $29.00" },
            ],
          },
          {
            emailAddress: "digest@publication.example",
            emails: [
              {
                subject: "Weekly digest",
                snippet: "Editorial stories and links",
              },
            ],
          },
          {
            emailAddress: "alerts@service.example",
            emails: [
              {
                subject: "New sign-in detected",
                snippet: "A new device signed into your account",
              },
            ],
          },
        ];
        const expected = [
          "alerts@service.example:Notification",
          "billing@merchant.example:Receipt",
          "digest@publication.example:Newsletter",
        ];

        await compareDecision({
          testName: "bulk categorization",
          expected,
          runJev: async () =>
            normalizeBulkResult(
              await decideBulkSenderCategories({
                config: decisionModelConfig,
                emailAccount: lunaEmailAccount,
                senders,
                categories,
                logger: decisionModelEvalLogger,
              }),
            ),
          runLuna: async () =>
            normalizeBulkResult(
              await categorizeSendersWithLlm({
                emailAccount: lunaEmailAccount,
                senders,
                categories,
              }),
            ),
          reporter,
        });
      },
      DECISION_MODEL_EVAL_TIMEOUT,
    );

    afterAll(() => reporter.printReport());
  },
);

function normalizeBulkResult(result: { sender: string; category?: string }[]) {
  return result.map(({ sender, category }) => `${sender}:${category}`).sort();
}
