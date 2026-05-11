import { describe, test, expect, afterAll } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { CONVERSATION_TRACKING_INSTRUCTIONS } from "@/utils/ai/choose-rule/run-rules";
import { getRuleConfig } from "@/utils/rule/consts";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";
import { getEmail, getRule } from "@/__tests__/helpers";

// pnpm test-ai eval/classification-feedback-hint
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/classification-feedback-hint

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

const fb = (
  subject: string | null,
  ruleName: string,
  eventType: "LABEL_ADDED" | "LABEL_REMOVED" = "LABEL_ADDED",
): ClassificationFeedbackItem => ({ subject, ruleName, eventType });

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
    feedback: [
      fb("Your order of MacBook Pro has shipped", "Receipt"),
      fb("Your order has been delivered", "Receipt"),
      fb("Spring sale: 40% off electronics", "Marketing"),
      fb("Your Amazon Prime membership renewal", "Receipt"),
    ],
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
    feedback: [
      fb("Your order of MacBook Pro has shipped", "Receipt"),
      fb("Your order has been delivered", "Receipt"),
      fb("Spring sale: 40% off electronics", "Marketing"),
      fb("Your Amazon Prime membership renewal", "Receipt"),
    ],
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
    feedback: [
      fb("Reminder: Product sync @ Fri Mar 21", "Calendar"),
      fb("New sign-in from Chrome on Mac", "Notification"),
      fb("Invitation: Design review @ Wed Mar 19", "Calendar"),
    ],
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
    feedback: [
      fb("Issue ING-1234 assigned to you", "Notification"),
      fb("Weekly digest: 12 issues closed", "Notification"),
      fb("Linear Changelog: February 2026", "Newsletter", "LABEL_REMOVED"),
      fb("Linear Changelog: February 2026", "Notification"),
    ],
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
    feedback: [
      fb("[acme/api] PR #1247 merged", "Notification"),
      fb("[acme/api] CI failed on main", "Notification"),
      fb("[acme/api] @sarah commented on #1245", "Notification"),
      fb("[acme/api] New release v2.3.0", "Notification"),
      fb("[acme/api] Issue #890 closed", "Notification"),
    ],
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
    feedback: [
      fb("Deployment complete: staging v2.4.1", "Notification"),
      fb("CI pipeline passed for main", "Notification"),
    ],
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
    feedback: null,
    expectedRule: "Receipt",
  },

  // --- Move-to-label pattern: remove + add creates mixed signal ---
  {
    name: "Changelog after user moved previous one from Newsletter to Notification",
    email: getEmail({
      from: "changelog@notion.so",
      subject: "What's new in Notion — March 2026",
      content:
        "New this month: Notion Mail is out of beta, improved database formulas, and 3x faster search. Plus: AI can now summarize entire databases. Read the full changelog at notion.so/releases.",
    }),
    feedback: [
      fb("What's new in Notion — February 2026", "Newsletter", "LABEL_REMOVED"),
      fb("What's new in Notion — February 2026", "Notification"),
      fb("Your Notion workspace is running low on storage", "Notification"),
    ],
    expectedRule: "Notification",
  },

  // --- Weak/noisy signal: only 1 classification ---
  {
    name: "Sender with single data point — hint should not dominate",
    email: getEmail({
      from: "hello@cal.com",
      subject: "New booking: Product demo with Acme Corp",
      content:
        "You have a new booking. Product demo with Acme Corp. Date: March 26, 2026 at 2:00 PM PST. Duration: 30 minutes. Join link: cal.com/meeting/abc123. Add to Google Calendar.",
    }),
    feedback: [fb("Your Cal.com weekly summary", "Newsletter")],
    expectedRule: "Calendar",
  },

  // --- Contradictory signal: user went back and forth ---
  {
    name: "Sender with contradictory history — AI should rely on content",
    email: getEmail({
      from: "team@figma.com",
      subject: "Figma Config 2026: Early bird tickets available",
      content:
        "Figma Config is back. June 24-25 in San Francisco. Register now for early bird pricing at $299 (regular $499). Speakers include design leaders from Apple, Google, and Stripe. config.figma.com",
      listUnsubscribe: "<https://figma.com/unsubscribe>",
    }),
    feedback: [
      fb("What's new in Figma — February", "Newsletter"),
      fb("What's new in Figma — February", "Newsletter", "LABEL_REMOVED"),
      fb("What's new in Figma — February", "Marketing"),
      fb("Figma Config 2025: Save the date", "Marketing"),
      fb("Your Figma invoice for March", "Receipt"),
    ],
    expectedRule: "Marketing",
  },

  // --- Hint should NOT override: receipt email despite marketing history ---
  {
    name: "Actual receipt from sender with mostly marketing history",
    email: getEmail({
      from: "noreply@uber.com",
      subject: "Your trip receipt — $24.50",
      content:
        "Thanks for riding with Uber. Trip on March 22. Pickup: 123 Main St. Dropoff: 456 Oak Ave. Fare: $19.00. Service fee: $3.50. Tax: $2.00. Total: $24.50. Paid with Visa ending 4242.",
    }),
    feedback: [
      fb("Get $10 off your next 3 rides", "Marketing"),
      fb("Uber Pass: Save 15% on every ride", "Marketing"),
      fb("New in your city: Uber Reserve", "Marketing"),
    ],
    expectedRule: "Receipt",
  },

  // --- Real SaaS tool: Stripe sends receipts, notifications, and marketing ---
  {
    name: "Stripe payout notification with mixed history",
    email: getEmail({
      from: "notifications@stripe.com",
      subject: "Your payout of $4,231.50 is on its way",
      content:
        "A payout of $4,231.50 USD was initiated to your Chase bank account ending in 9876. Expected arrival: March 24, 2026. View payout details in your Stripe Dashboard.",
    }),
    feedback: [
      fb("Invoice #2026-0312 for Acme Corp", "Receipt"),
      fb("Stripe Atlas: Incorporate your startup", "Marketing"),
      fb("Your payout of $3,100.00 is on its way", "Notification"),
      fb("Action required: Verify your bank account", "Notification"),
    ],
    expectedRule: ["Notification", "Receipt"],
  },
];

describe.runIf(shouldRunEval)("Eval: Classification Feedback Hints", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("classification-feedback-hint", (model, emailAccount) => {
    for (const tc of testCases) {
      test(
        tc.name,
        async () => {
          const result = await aiChooseRule({
            email: tc.email,
            rules,
            emailAccount,
            classificationFeedback: tc.feedback,
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
