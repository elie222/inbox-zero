import { afterAll, describe, expect, test } from "vitest";
import { getEmail, getMockMessage } from "@/__tests__/helpers";
import { colleagueWorkMailCases } from "@/__tests__/eval/colleague-work-mail-cases";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { SystemType } from "@/generated/prisma/enums";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { decisionModelChooseRule } from "@/utils/decision-model/choose-rule";
import {
  CONVERSATION_TRACKING_INSTRUCTIONS,
  CONVERSATION_TRACKING_META_RULE_ID,
} from "@/utils/reply-tracker/conversation-status-config";
import { getRuleConfig } from "@/utils/rule/consts";
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

// What the chooser receives in production for an account on the default rules.
const defaultSystemRules: {
  id: string;
  name: string;
  instructions: string;
  systemType: SystemType | null;
}[] = [
  ...[
    SystemType.NEWSLETTER,
    SystemType.MARKETING,
    SystemType.CALENDAR,
    SystemType.RECEIPT,
    SystemType.NOTIFICATION,
    SystemType.OTP,
  ].map((systemType) => {
    const config = getRuleConfig(systemType);
    return {
      id: systemType,
      name: config.name,
      instructions: config.instructions,
      systemType,
    };
  }),
  {
    id: CONVERSATION_TRACKING_META_RULE_ID,
    name: "Conversations",
    instructions: CONVERSATION_TRACKING_INSTRUCTIONS,
    systemType: null,
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

    for (const testCase of colleagueWorkMailCases) {
      const acceptable = [testCase.expectedRule].flat();
      const testName = `default rules: ${testCase.email.from} / ${testCase.email.subject} -> ${acceptable.join(" | ")}`;
      test(
        testName,
        async () => {
          const result = await decisionModelChooseRule({
            decisionModel: decisionModelConfig,
            message: toParsedMessage(testCase.email),
            emailAccount: lunaEmailAccount,
            rules: defaultSystemRules,
            classificationFeedback: null,
            logger: decisionModelEvalLogger,
          });
          const actual =
            result.type === "undecided"
              ? "Undecided"
              : (result.rules[0]?.rule.name ?? "None");
          const pass = acceptable.includes(actual);

          reporter.record({
            testName,
            model: decisionModelConfig.modelId,
            pass,
            expected: acceptable.join(" | "),
            actual,
          });
          expect(pass, actual).toBe(true);
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

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
    runJev: async () => {
      const result = await decisionModelChooseRule({
        decisionModel: decisionModelConfig,
        message: toParsedMessage(email),
        emailAccount: lunaEmailAccount,
        rules,
        classificationFeedback: null,
        logger: decisionModelEvalLogger,
      });
      if (result.type === "undecided") return ["Undecided"];
      return result.rules.map(({ rule }) => rule.name).sort();
    },
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
  const message = getMockMessage({
    from: email.from,
    to: email.to,
    subject: email.subject,
    textPlain: email.content,
    textHtml: "",
  });
  return {
    ...message,
    headers: {
      ...message.headers,
      "list-unsubscribe": email.listUnsubscribe,
    },
  } as unknown as ParsedMessage;
}
