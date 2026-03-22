import { describe, test, expect, vi, afterAll } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { CONVERSATION_TRACKING_INSTRUCTIONS } from "@/utils/ai/choose-rule/run-rules";
import { getRuleConfig } from "@/utils/rule/consts";
import { getEmail, getRule } from "@/__tests__/helpers";

// pnpm test-ai eval/sender-classification-hint
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/sender-classification-hint

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;

const systemRule = (type: SystemType) => {
  const config = getRuleConfig(type);
  return getRule(config.instructions, [], config.name);
};

const rules = [
  systemRule(SystemType.NEWSLETTER),
  systemRule(SystemType.MARKETING),
  systemRule(SystemType.CALENDAR),
  systemRule(SystemType.RECEIPT),
  systemRule(SystemType.NOTIFICATION),
  getRule(CONVERSATION_TRACKING_INSTRUCTIONS, [], "Conversations"),
];

// Test cases where sender classification hints should improve accuracy.
// Each case has an email that could be ambiguous, plus a hint that should
// steer the AI toward the correct classification.
const testCases = [
  // --- Split sender: Amazon sends receipts AND marketing ---
  {
    name: "Amazon order confirmation with receipt history",
    email: getEmail({
      from: "auto-confirm@amazon.com",
      subject: "Your Amazon.com order of Wireless Mouse",
      content:
        "Your order has been placed. Order #112-1234567-8901234. Estimated delivery: March 25. Logitech MX Master 3S: $89.99. Shipping: FREE. Order total: $89.99.",
    }),
    hint: `<sender_classifications>
User has manually classified emails from this sender into these rules:
- "Your order of MacBook Pro has shipped" → Receipt
- "Your order has been delivered" → Receipt
- "Spring sale: 40% off electronics" → Marketing
- "Your Amazon Prime membership renewal" → Receipt
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`,
    expectedRule: "Receipt",
  },
  {
    name: "Amazon marketing email with receipt history",
    email: getEmail({
      from: "store-news@amazon.com",
      subject: "Deals you won't want to miss this weekend",
      content:
        "Top picks for you: Save up to 50% on electronics, home, and kitchen. Lightning deals start at 3 PM. Shop now at amazon.com/deals.",
      listUnsubscribe: "<https://amazon.com/unsubscribe>",
    }),
    hint: `<sender_classifications>
User has manually classified emails from this sender into these rules:
- "Your order of MacBook Pro has shipped" → Receipt
- "Your order has been delivered" → Receipt
- "Spring sale: 40% off electronics" → Marketing
- "Your Amazon Prime membership renewal" → Receipt
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`,
    expectedRule: "Marketing",
  },

  // --- Split sender: Google sends notifications AND calendar ---
  {
    name: "Google calendar invite with mixed history",
    email: getEmail({
      from: "calendar-notification@google.com",
      subject: "Invitation: Team standup @ Mon Mar 24, 9:00 AM",
      content:
        "You have been invited to the following event. Team standup. When: Mon Mar 24, 9:00 AM – 9:15 AM (PST). Where: meet.google.com/abc-xyz. Organizer: sarah@company.com.",
    }),
    hint: `<sender_classifications>
User has manually classified emails from this sender into these rules:
- "Reminder: Product sync @ Fri Mar 21" → Calendar
- "New sign-in from Chrome on Mac" → Notification
- "Invitation: Design review @ Wed Mar 19" → Calendar
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`,
    expectedRule: "Calendar",
  },

  // --- Correction signal: user removed a label (negative feedback) ---
  {
    name: "Company update that was incorrectly classified as newsletter",
    email: getEmail({
      from: "updates@linear.app",
      subject: "Linear Changelog: March 2026",
      content:
        "What's new in Linear. Improved project views, faster search, and new keyboard shortcuts. We also fixed 47 bugs this month. Read the full changelog at linear.app/changelog.",
    }),
    hint: `<sender_classifications>
User has manually classified emails from this sender into these rules:
- "Issue ING-1234 assigned to you" → Notification
- "Weekly digest: 12 issues closed" → Notification
- "Linear Changelog: February 2026" removed from Newsletter
- "Linear Changelog: February 2026" → Notification
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`,
    expectedRule: "Notification",
  },

  // --- Strong single-category signal ---
  {
    name: "GitHub notification with consistent history",
    email: getEmail({
      from: "notifications@github.com",
      subject: "[acme/backend] Issue #892: API rate limiting not working",
      content:
        "@dev-user opened this issue. The rate limiter middleware isn't applying limits to /api/v2 endpoints. Steps to reproduce: 1. Hit /api/v2/users 100 times in 1 second. Expected: 429 after 60 requests. Actual: All 100 succeed.",
    }),
    hint: `<sender_classifications>
User has manually classified emails from this sender into these rules:
- "[acme/api] PR #1247 merged" → Notification
- "[acme/api] CI failed on main" → Notification
- "[acme/api] @sarah commented on #1245" → Notification
- "[acme/api] New release v2.3.0" → Notification
- "[acme/api] Issue #890 closed" → Notification
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`,
    expectedRule: "Notification",
  },

  // --- Hint should NOT override clear email content ---
  {
    name: "Personal email should be Conversations despite notification history",
    email: getEmail({
      from: "cto@company.com",
      subject: "Re: Architecture proposal for Q2",
      content:
        "Hey, I reviewed the proposal and I think the microservices approach makes sense for the auth service. Can we chat about the database migration strategy tomorrow? I have concerns about the downtime window.",
    }),
    hint: `<sender_classifications>
User has manually classified emails from this sender into these rules:
- "Deployment complete: staging v2.4.1" → Notification
- "CI pipeline passed for main" → Notification
These are hints from past user actions. Still evaluate the current email on its own merits.
</sender_classifications>`,
    expectedRule: "Conversations",
  },

  // --- No hint baseline: same email without any hint ---
  {
    name: "Amazon order confirmation without any hint (baseline)",
    email: getEmail({
      from: "auto-confirm@amazon.com",
      subject: "Your Amazon.com order of Wireless Mouse",
      content:
        "Your order has been placed. Order #112-1234567-8901234. Estimated delivery: March 25. Logitech MX Master 3S: $89.99. Shipping: FREE. Order total: $89.99.",
    }),
    hint: null,
    expectedRule: "Receipt",
  },
];

describe.runIf(shouldRunEval)("Eval: Sender Classification Hints", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("sender-classification-hint", (model, emailAccount) => {
    for (const tc of testCases) {
      test(
        tc.name,
        async () => {
          const result = await aiChooseRule({
            email: tc.email,
            rules,
            emailAccount,
            senderClassificationHint: tc.hint,
          });

          const primaryRule = result.rules.find((r) => r.isPrimary);
          const actual =
            primaryRule?.rule.name ?? result.rules[0]?.rule.name ?? "no match";
          const acceptable = Array.isArray(tc.expectedRule)
            ? tc.expectedRule
            : [tc.expectedRule];
          const pass = acceptable.includes(actual);

          evalReporter.record({
            testName: tc.name,
            model: model.label,
            pass,
            expected: Array.isArray(tc.expectedRule)
              ? tc.expectedRule.join(" | ")
              : tc.expectedRule,
            actual,
          });

          expect(acceptable).toContain(actual);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
