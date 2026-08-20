import { describe, test, expect, afterAll } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiClean } from "@/utils/ai/clean/ai-clean";
import type { EmailForLLM } from "@/utils/types";

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;

const labels = [
  { id: "label-newsletters", name: "Newsletters" },
  { id: "label-receipts", name: "Receipts" },
  { id: "label-finance", name: "Finance" },
  { id: "label-personal", name: "Personal" },
];

const skips = { reply: false, receipt: true };

type TestCase = {
  name: string;
  message: EmailForLLM;
  expectedArchive: boolean;
  expectedLabel: string | null;
};

const testCases: TestCase[] = [
  {
    name: "newsletter → Newsletters",
    message: getEmail({
      from: "hello@morningbrew.com",
      subject: "☕ Mar 10 — Markets rally on jobs data, OpenAI's new model",
      content:
        "Good morning. US markets closed higher Friday after the February jobs report showed 275K new positions. Meanwhile, OpenAI quietly released a new reasoning model. Here's your daily briefing.",
    }),
    expectedArchive: true,
    expectedLabel: "Newsletters",
  },
  {
    name: "receipt → Receipts",
    // Reachable in production via the maybe-receipt path: the sender and
    // subject avoid the deterministic isReceipt lists in find-receipts.ts
    // ("receipt@", "invoice@", "billing@", "Payment receipt", ...), but the
    // subject contains "purchase" so isMaybeReceipt sends it to the AI.
    message: getEmail({
      from: "noreply@gumroad.com",
      subject: "You've purchased: Design System Checklist",
      content:
        "Thanks for your purchase! Design System Checklist by Sarah K. Amount: $24.00. Payment: Visa ending in 4242. Download your file here. If you have any issues, reply to this email.",
    }),
    expectedArchive: false,
    expectedLabel: "Receipts",
  },
  {
    name: "bank statement → Finance",
    message: getEmail({
      from: "statements@revolut.com",
      subject: "Your monthly statement is ready",
      content:
        "Your Revolut account statement for February 2026 is now available. It contains a summary of your transactions, balances, and fees for the month.",
    }),
    expectedArchive: false,
    expectedLabel: "Finance",
  },
  {
    name: "personal email needing reply → no label, keep",
    message: getEmail({
      from: "sarah@gmail.com",
      subject: "Dinner on Friday?",
      content:
        "Hey! Are you free for dinner on Friday night? I was thinking of trying that new Italian place downtown. Let me know what time works for you.",
    }),
    expectedArchive: false,
    expectedLabel: null,
  },
  {
    name: "GitHub notification without matching label → no label",
    message: getEmail({
      from: "notifications@github.com",
      subject: "[inbox-zero] Issue #42: Cleaner fails on empty inbox",
      content:
        "elie222 opened issue #42. The cleaner fails when the inbox is empty. Assignees: none. Labels: bug. Comment here or open the issue in your dashboard.",
    }),
    expectedArchive: true,
    expectedLabel: null,
  },
  {
    name: "vague teaser without clear category → no label",
    message: getEmail({
      from: "info@newstartup.io",
      subject: "Thanks for your interest",
      content:
        "Hi there, thanks for stopping by. We're building something we think you'll love. Stay tuned for updates — we'll be in touch soon with more details.",
    }),
    expectedArchive: true,
    expectedLabel: null,
  },
];

describe.runIf(shouldRunEval)("Eval: Clean AI labels", () => {
  const evalReporter = createEvalReporter({ evalName: "clean-ai-label" });

  describeEvalMatrix("clean-ai", (model, emailAccount) => {
    for (const tc of testCases) {
      test(
        `${tc.name} [archive=${tc.expectedArchive}, label=${tc.expectedLabel ?? "none"}]`,
        async () => {
          const result = await aiClean({
            emailAccount,
            messageId: tc.message.id,
            messages: [tc.message],
            skips,
            labels,
          });

          const actual = result.label ?? "none";
          const expected = tc.expectedLabel ?? "none";
          const pass =
            actual === expected && result.archive === tc.expectedArchive;
          evalReporter.record({
            testName: tc.name,
            model: model.label,
            pass,
            expected: `archive=${tc.expectedArchive}, label=${expected}`,
            actual: `archive=${result.archive}, label=${actual}`,
          });

          expect(result.label ?? "none").toBe(expected);
          expect(result.archive).toBe(tc.expectedArchive);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getEmail({
  from,
  subject,
  content,
}: {
  from: string;
  subject: string;
  content: string;
}): EmailForLLM {
  return {
    id: "msg-1",
    from,
    to: "user@gmail.com",
    subject,
    content,
    date: new Date("2026-03-10T09:00:00Z"),
  };
}
