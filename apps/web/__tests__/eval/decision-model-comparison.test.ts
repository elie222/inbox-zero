import { afterAll, describe, expect, test } from "vitest";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
  SystemType,
} from "@/generated/prisma/enums";
import { env } from "@/env";
import { getEmail, getMockMessage } from "@/__tests__/helpers";
import {
  EVAL_MODEL_CATALOG,
  getEmailAccountForModel,
} from "@/__tests__/eval/model-catalog";
import { shouldRunEvalTests } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { createScopedLogger } from "@/utils/logger";
import { getRuleConfig } from "@/utils/rule/consts";
import { decideThreadStatus } from "@/utils/decision-model/thread-status";
import { decideRelevantReplyMemories } from "@/utils/decision-model/reply-memory-selection";
import { decideRecurringPattern } from "@/utils/decision-model/recurring-pattern";
import { decideSenderCategory } from "@/utils/decision-model/categorize-sender";
import { decideUnsubscribePageState } from "@/utils/decision-model/unsubscribe-page";
import { decideColdEmail } from "@/utils/decision-model/cold-email";
import { determineThreadStatusWithLlm } from "@/utils/ai/reply/determine-thread-status";
import { selectRelevantReplyMemoriesWithLlm } from "@/utils/ai/reply/select-reply-memories";
import { detectRecurringPatternWithLlm } from "@/utils/ai/choose-rule/ai-detect-recurring-pattern";
import { categorizeSenderWithLlm } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { checkUnsubscribePageStateWithLlm } from "@/utils/ai/senders/unsubscribe-page";
import { checkColdEmailWithLlm } from "@/utils/cold-email/is-cold-email";
import { decisionModelChooseRule } from "@/utils/decision-model/choose-rule";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import type { ParsedMessage } from "@/utils/types";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/decision-model-comparison.test.ts

const shouldRun = shouldRunEvalTests() && !!env.TYPESAFE_API_KEY;
const TIMEOUT = 60_000;
const logger = createScopedLogger("eval-decision-model-comparison");
const emailAccount = getEmailAccountForModel(
  EVAL_MODEL_CATALOG["gpt-5.6-luna"],
);
const decisionModel = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: env.TYPESAFE_API_KEY ?? "",
};

describe.runIf(shouldRun)("Eval: JEV vs GPT-5.6 Luna decisions", () => {
  const reporter = createEvalReporter({
    evalName: "decision-model-comparison",
  });

  test(
    "rule selection",
    async () => {
      const rules = [
        {
          id: "receipts",
          name: "Receipts",
          instructions:
            "Purchase receipts, invoices, and payment confirmations",
        },
        {
          id: "newsletters",
          name: "Newsletters",
          instructions: "Editorial newsletters and recurring digests",
        },
      ];
      const email = getEmail({
        from: "billing@merchant.example",
        subject: "Receipt for order #1234",
        content: "Payment received. Your total was $29.00.",
      });

      await compare({
        testName: "rule selection: receipt",
        expected: "Receipts",
        runJev: async () =>
          (
            await decisionModelChooseRule({
              decisionModel,
              message: getMockMessage({
                from: email.from,
                to: emailAccount.email,
                subject: email.subject,
                textPlain: email.content,
              }) as unknown as ParsedMessage,
              emailAccount,
              rules,
              coldEmailRule: null,
              classificationFeedback: null,
              logger,
            })
          ).rules[0]?.rule.name ?? null,
        runLuna: async () =>
          (
            await aiChooseRule({
              email,
              emailAccount,
              rules,
              logger,
            })
          ).rules[0]?.rule.name ?? null,
        reporter,
      });
    },
    TIMEOUT,
  );

  test(
    "thread status",
    async () => {
      const definitions = [
        SystemType.TO_REPLY,
        SystemType.AWAITING_REPLY,
        SystemType.FYI,
        SystemType.ACTIONED,
      ].map((systemType) => ({
        systemType,
        instructions: getRuleConfig(systemType).instructions,
      }));
      const threadMessages = [
        getEmail({
          from: "customer@example.com",
          to: emailAccount.email,
          content: "Can you send the updated proposal by Friday?",
        }),
      ];

      await compare({
        testName: "thread status: explicit request",
        expected: SystemType.TO_REPLY,
        runJev: async () =>
          (
            await decideThreadStatus({
              config: decisionModel,
              emailAccount,
              definitions,
              threadMessages,
              userSentLastEmail: false,
              logger,
            })
          ).status,
        runLuna: async () =>
          (
            await determineThreadStatusWithLlm({
              emailAccount,
              definitions,
              threadMessages,
              userSentLastEmail: false,
            })
          ).status,
        reporter,
      });

      const completedThread = [
        getEmail({
          from: emailAccount.email,
          to: "vendor@example.com",
          content: "Could you send me the signed contract?",
        }),
        getEmail({
          from: "vendor@example.com",
          to: emailAccount.email,
          content: "Attached is the signed contract you requested.",
        }),
      ];

      await compare({
        testName: "thread status: request fulfilled",
        expected: SystemType.ACTIONED,
        runJev: async () =>
          (
            await decideThreadStatus({
              config: decisionModel,
              emailAccount,
              definitions,
              threadMessages: completedThread,
              userSentLastEmail: false,
              logger,
            })
          ).status,
        runLuna: async () =>
          (
            await determineThreadStatusWithLlm({
              emailAccount,
              definitions,
              threadMessages: completedThread,
              userSentLastEmail: false,
            })
          ).status,
        reporter,
      });
    },
    TIMEOUT,
  );

  test(
    "reply memory selection",
    async () => {
      const candidates = [
        {
          id: "pricing",
          content: "The Pro plan costs $49 per month.",
          kind: ReplyMemoryKind.FACT,
          scopeType: ReplyMemoryScopeType.TOPIC,
          scopeValue: "pricing",
        },
        {
          id: "shipping",
          content: "Ask for a tracking number when shipments are delayed.",
          kind: ReplyMemoryKind.PROCEDURE,
          scopeType: ReplyMemoryScopeType.TOPIC,
          scopeValue: "shipping",
        },
      ];
      const emailContent = "How much does the Pro plan cost?";

      await compare({
        testName: "reply memory: pricing",
        expected: "pricing",
        runJev: async () =>
          (
            await decideRelevantReplyMemories({
              config: decisionModel,
              candidates,
              emailContent,
              emailAccount,
              logger,
            })
          ).join(","),
        runLuna: async () =>
          (
            (await selectRelevantReplyMemoriesWithLlm({
              candidates,
              emailContent,
              emailAccount,
              logger,
            })) ?? []
          ).join(","),
        reporter,
      });

      await compare({
        testName: "reply memory: no relevant memory",
        expected: "",
        runJev: async () =>
          (
            await decideRelevantReplyMemories({
              config: decisionModel,
              candidates,
              emailContent: "Can you confirm tomorrow's meeting time?",
              emailAccount,
              logger,
            })
          ).join(","),
        runLuna: async () =>
          (
            (await selectRelevantReplyMemoriesWithLlm({
              candidates,
              emailContent: "Can you confirm tomorrow's meeting time?",
              emailAccount,
              logger,
            })) ?? []
          ).join(","),
        reporter,
      });
    },
    TIMEOUT,
  );

  test(
    "recurring pattern",
    async () => {
      const emails = [
        getEmail({
          from: "receipts@payments.example",
          subject: "Receipt #1001",
          content: "Payment received. Total: $20.",
        }),
        getEmail({
          from: "receipts@payments.example",
          subject: "Receipt #1002",
          content: "Payment received. Total: $35.",
        }),
        getEmail({
          from: "receipts@payments.example",
          subject: "Receipt #1003",
          content: "Payment received. Total: $18.",
        }),
      ];
      const rules = [
        {
          name: "Receipts",
          instructions: "Payment confirmations and receipts",
        },
        { name: "Newsletter", instructions: "Editorial newsletters" },
      ];

      await compare({
        testName: "recurring pattern: receipts sender",
        expected: "Receipts",
        runJev: async () =>
          (
            await decideRecurringPattern({
              config: decisionModel,
              emails,
              emailAccount,
              rules,
              consistentRuleName: "Receipts",
              logger,
            })
          ).matchedRule,
        runLuna: async () =>
          (
            await detectRecurringPatternWithLlm({
              emails,
              emailAccount,
              rules,
              consistentRuleName: "Receipts",
              logger,
            })
          )?.matchedRule ?? null,
        reporter,
      });

      const mixedEmails = [
        getEmail({
          from: "alex@example.com",
          subject: "Dinner",
          content: "Are you free for dinner Friday?",
        }),
        getEmail({
          from: "alex@example.com",
          subject: "Invoice",
          content: "Here is the invoice from our shared trip.",
        }),
        getEmail({
          from: "alex@example.com",
          subject: "Introduction",
          content: "Meet my colleague Sam.",
        }),
      ];

      await compare({
        testName: "recurring pattern: varied personal sender",
        expected: null,
        runJev: async () =>
          (
            await decideRecurringPattern({
              config: decisionModel,
              emails: mixedEmails,
              emailAccount,
              rules,
              consistentRuleName: "Receipts",
              logger,
            })
          ).matchedRule,
        runLuna: async () =>
          (
            await detectRecurringPatternWithLlm({
              emails: mixedEmails,
              emailAccount,
              rules,
              consistentRuleName: "Receipts",
              logger,
            })
          )?.matchedRule ?? null,
        reporter,
      });
    },
    TIMEOUT,
  );

  test(
    "sender categorization",
    async () => {
      const categories = [
        { name: "Newsletter", description: "Editorial subscription email" },
        { name: "Receipt", description: "Purchase receipt or invoice" },
      ];
      const sender = "billing@merchant.example";
      const previousEmails = [
        { subject: "Your receipt", snippet: "Order total: $29.00" },
      ];

      await compare({
        testName: "sender category: receipt",
        expected: "Receipt",
        runJev: async () =>
          (
            await decideSenderCategory({
              config: decisionModel,
              emailAccount,
              sender,
              previousEmails,
              categories,
              logger,
            })
          )?.category ?? null,
        runLuna: async () =>
          (
            await categorizeSenderWithLlm({
              emailAccount,
              sender,
              previousEmails,
              categories,
            })
          )?.category ?? null,
        reporter,
      });

      await compare({
        testName: "sender category: ambiguous personal sender",
        expected: null,
        runJev: async () =>
          (
            await decideSenderCategory({
              config: decisionModel,
              emailAccount,
              sender: "friend@example.com",
              previousEmails: [
                { subject: "Dinner Friday?", snippet: "Are you free at 7?" },
              ],
              categories,
              logger,
            })
          )?.category ?? null,
        runLuna: async () =>
          (
            await categorizeSenderWithLlm({
              emailAccount,
              sender: "friend@example.com",
              previousEmails: [
                { subject: "Dinner Friday?", snippet: "Are you free at 7?" },
              ],
              categories,
            })
          )?.category ?? null,
        reporter,
      });
    },
    TIMEOUT,
  );

  test(
    "safety-sensitive binary decisions",
    async () => {
      const pageText =
        "Unsubscribed. Your address has been removed and you will receive no more messages.";

      await compare({
        testName: "unsubscribe page: completed",
        expected: "confirmed",
        runJev: () =>
          decideUnsubscribePageState({
            config: decisionModel,
            pageText,
            emailAccount,
            logger,
          }),
        runLuna: () =>
          checkUnsubscribePageStateWithLlm({ pageText, emailAccount }),
        reporter,
      });

      const confirmationPage =
        "To unsubscribe, click the Confirm Unsubscribe button below.";

      await compare({
        testName: "unsubscribe page: confirmation still required",
        expected: "not_confirmed",
        runJev: () =>
          decideUnsubscribePageState({
            config: decisionModel,
            pageText: confirmationPage,
            emailAccount,
            logger,
          }),
        runLuna: () =>
          checkUnsubscribePageStateWithLlm({
            pageText: confirmationPage,
            emailAccount,
          }),
        reporter,
      });

      const email = getEmail({
        from: "sales@agency.example",
        to: emailAccount.email,
        subject: "Can we grow your pipeline?",
        content:
          "We have never met, but our agency can book qualified meetings for your company. Want a sales call?",
      });

      await compare({
        testName: "cold email: generic sales outreach",
        expected: true,
        runJev: async () =>
          (
            await decideColdEmail({
              config: decisionModel,
              email,
              emailAccount,
              coldEmailRule: null,
              logger,
            })
          ).coldEmail,
        runLuna: async () =>
          (
            await checkColdEmailWithLlm({
              email,
              emailAccount,
              coldEmailRule: null,
              logger,
            })
          ).isColdEmail,
        reporter,
      });

      const newsletter = getEmail({
        from: "digest@publication.example",
        to: emailAccount.email,
        subject: "This week's engineering digest",
        content:
          "Here are this week's top engineering stories. Manage your subscription preferences below.",
        listUnsubscribe: "https://publication.example/unsubscribe",
      });

      await compare({
        testName: "cold email: subscribed newsletter",
        expected: false,
        runJev: async () =>
          (
            await decideColdEmail({
              config: decisionModel,
              email: newsletter,
              emailAccount,
              coldEmailRule: null,
              logger,
            })
          ).coldEmail,
        runLuna: async () =>
          (
            await checkColdEmailWithLlm({
              email: newsletter,
              emailAccount,
              coldEmailRule: null,
              logger,
            })
          ).isColdEmail,
        reporter,
      });
    },
    TIMEOUT,
  );

  afterAll(() => reporter.printReport());
});

async function compare<T>({
  testName,
  expected,
  runJev,
  runLuna,
  reporter,
}: {
  testName: string;
  expected: T;
  runJev: () => Promise<T>;
  runLuna: () => Promise<T>;
  reporter: ReturnType<typeof createEvalReporter>;
}) {
  const [jev, luna] = await Promise.all([runJev(), runLuna()]);

  reporter.record({
    testName,
    model: "JEV",
    pass: jev === expected,
    expected: String(expected),
    actual: String(jev),
  });
  reporter.record({
    testName,
    model: "GPT-5.6 Luna",
    pass: luna === expected,
    expected: String(expected),
    actual: String(luna),
  });

  expect(jev).toBe(expected);
  expect(luna).toBe(expected);
}
