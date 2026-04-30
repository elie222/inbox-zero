import { afterAll, describe, expect, test, vi } from "vitest";
import { getEmailAccount, getRule } from "@/__tests__/helpers";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { SystemType } from "@/generated/prisma/enums";
import {
  CONVERSATION_TRACKING_META_RULE_ID,
  ensureConversationRuleForReplyCompatiblePrimary,
} from "@/utils/ai/choose-rule/run-rules";
import type { RuleWithActions } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/reply-compatible-primary-rule
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-compatible-primary-rule

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 20_000;
const logger = createScopedLogger("eval-reply-compatible-primary-rule");
const evalReporter = createEvalReporter();

const cases = [
  {
    name: "legal contracts",
    ruleName: "Legal",
    instructions: "Contracts, legal agreements, and lawyer communications",
    expected: true,
  },
  {
    name: "spanish lawyer rule",
    ruleName: "Abogado",
    instructions:
      "Correos de mi abogado sobre contratos, acuerdos legales y negociaciones",
    expected: true,
  },
  {
    name: "hebrew legal rule",
    ruleName: "משפטי",
    instructions: "מיילים מעורך הדין שלי לגבי חוזים והסכמים משפטיים",
    expected: true,
  },
  {
    name: "receipt rule",
    ruleName: "Receipts",
    instructions: "Receipts, invoices, and purchase confirmations",
    expected: false,
  },
  {
    name: "newsletter rule",
    ruleName: "Newsletters",
    instructions: "Newsletter subscriptions and bulk content updates",
    expected: false,
  },
  {
    name: "team updates rule",
    ruleName: "Team Updates",
    instructions: "Broad updates and announcements from my internal team",
    expected: false,
  },
  {
    name: "account security rule",
    ruleName: "Security Codes",
    instructions:
      "Login codes, password resets, and account verification emails",
    expected: false,
  },
];

describe.runIf(shouldRunEval)("Eval: reply-compatible primary rule", () => {
  describeEvalMatrix(
    "reply compatibility",
    (model, emailAccount) => {
      for (const scenario of cases) {
        test(
          scenario.name,
          async () => {
            const primaryRule = {
              ...getRule(scenario.instructions, [], scenario.ruleName),
              id: `primary-${scenario.name}`,
            } as RuleWithActions;

            const result =
              await ensureConversationRuleForReplyCompatiblePrimary({
                conversationRules: [getConversationRule()],
                regularRules: [primaryRule, getConversationMetaRule()],
                matches: [{ rule: primaryRule }],
                emailAccount,
                modelType: "default",
                logger,
              });

            const actual = result.some(
              (match) => match.rule.id === CONVERSATION_TRACKING_META_RULE_ID,
            );
            const pass = actual === scenario.expected;

            evalReporter.record({
              testName: scenario.name,
              model: model.label,
              expected: scenario.expected ? "eligible" : "not eligible",
              actual: actual ? "eligible" : "not eligible",
              pass,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );
      }
    },
    getEmailAccount(),
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getConversationRule(): RuleWithActions {
  return {
    ...getRule("Emails that need a reply", [], "To Reply"),
    id: "to-reply-rule",
    systemType: SystemType.TO_REPLY,
  } as RuleWithActions;
}

function getConversationMetaRule(): RuleWithActions {
  return {
    ...getRule("Conversation tracking", [], "Conversations"),
    id: CONVERSATION_TRACKING_META_RULE_ID,
    systemType: null,
  } as RuleWithActions;
}
