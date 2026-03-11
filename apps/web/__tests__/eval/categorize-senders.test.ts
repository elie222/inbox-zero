import { describe, test, expect, vi, afterAll } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { evalReporter } from "@/__tests__/eval/reporter";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { defaultCategory } from "@/utils/categories";

// pnpm test-ai eval/categorize-senders
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/categorize-senders

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 30_000;

// Enabled categories: Newsletter, Marketing, Receipt, Notification, Other
const testCases = [
  // Clear-cut cases
  {
    sender: "newsletter@techcrunch.com",
    emails: [
      {
        subject: "TechCrunch Daily: Top stories for today",
        snippet: "Here are today's top stories in tech...",
      },
    ],
    expected: "Newsletter",
  },
  {
    sender: "promo@shopify.com",
    emails: [
      {
        subject: "Flash sale: 50% off all plans this weekend only!",
        snippet: "Don't miss our biggest sale of the year",
      },
    ],
    expected: "Marketing",
  },
  {
    sender: "noreply@stripe.com",
    emails: [
      {
        subject: "Payment receipt for $49.99",
        snippet: "Your payment of $49.99 to Acme Corp has been processed",
      },
    ],
    expected: "Receipt",
  },
  {
    sender: "notifications@github.com",
    emails: [
      {
        subject: "[inbox-zero] Issue #42 was closed",
        snippet: "mattpocock closed this issue",
      },
    ],
    expected: "Notification",
  },
  // Boundary cases -- these test the edges between categories
  {
    sender: "noreply@amazon.com",
    emails: [
      {
        subject: "Your Amazon.com order #112-3456789 confirmation",
        snippet: "Thank you for your purchase. Your order total was $29.99",
      },
    ],
    expected: "Receipt",
    note: "Order confirmation with price is a receipt",
  },
  {
    sender: "digest@medium.com",
    emails: [
      {
        subject: "Daily Digest: Stories for you",
        snippet: "Top stories picked for you based on your reading history",
      },
    ],
    expected: "Newsletter",
    note: "Personalized digests are still newsletters",
  },
  {
    sender: "sales@hubspot.com",
    emails: [
      {
        subject: "Ready to upgrade? Get 30% off HubSpot Pro",
        snippet:
          "Your free trial ends in 3 days. Upgrade now and save 30% on your first year",
      },
      {
        subject: "See how Company X grew 200% with HubSpot",
        snippet:
          "Book a demo to learn how our CRM can transform your sales pipeline",
      },
    ],
    expected: "Marketing",
    note: "Direct sales outreach with discounts and demos is marketing",
  },
  {
    sender: "alerts@sentry.io",
    emails: [
      {
        subject: "Alert: Error rate spike in production",
        snippet: "Error rate increased by 300% in the last 5 minutes",
      },
    ],
    expected: "Notification",
    note: "System alerts are notifications",
  },
  // Newsletter vs Marketing boundary
  {
    sender: "weekly@substack.com",
    emails: [
      {
        subject: "Issue #47: The state of frontend in 2026",
        snippet:
          "Welcome to this week's issue. Let's dive into the latest trends in frontend development.",
      },
      {
        subject: "Issue #46: Why TypeScript won",
        snippet: "This week we explore TypeScript's dominance.",
      },
    ],
    expected: "Newsletter",
    note: "Recurring issues with editorial content are newsletters, not marketing",
  },
  {
    sender: "hello@canva.com",
    emails: [
      {
        subject: "Unlock premium features — upgrade today",
        snippet: "Get access to 100M+ photos, videos, and templates",
      },
      {
        subject: "New: AI-powered design tools just launched",
        snippet: "Try our new Magic Design feature free for 7 days",
      },
    ],
    expected: "Marketing",
    note: "Upgrade prompts and feature launches from a SaaS are marketing",
  },
  // Receipt vs Notification boundary
  {
    sender: "noreply@uber.com",
    emails: [
      {
        subject: "Your trip receipt",
        snippet:
          "Trip with John on Mar 5. Total: $12.50. Payment: Visa ending in 4242",
      },
    ],
    expected: "Receipt",
    note: "Trip receipt with fare amount is a receipt",
  },
  {
    sender: "noreply@linear.app",
    emails: [
      {
        subject: "ENG-1234: Fix login timeout — status changed to Done",
        snippet: "John marked ENG-1234 as Done",
      },
      {
        subject: "ENG-1230: Refactor auth module — assigned to you",
        snippet: "You were assigned to ENG-1230",
      },
    ],
    expected: "Notification",
    note: "Project management status updates are notifications",
  },
  // Multiple emails provide stronger signal
  {
    sender: "info@airline.com",
    emails: [
      {
        subject: "Your booking confirmation #ABC123",
        snippet:
          "Flight NY → LA on Apr 15. Confirmation: ABC123. Total paid: $349",
      },
      {
        subject: "E-ticket receipt for booking #ABC123",
        snippet:
          "Your e-ticket is attached. Payment of $349 charged to Visa ending 4242",
      },
    ],
    expected: "Receipt",
    note: "Booking confirmations with payment details are receipts",
  },
  // Minimal context -- only sender address, no email history
  {
    sender: "unknown@randomcompany.com",
    emails: [],
    expected: "Other",
  },
];

describe.runIf(isAiTest)("Eval: Categorize Senders", () => {
  evalReporter.reset();

  describeEvalMatrix("categorize", (model, emailAccount) => {
    for (const tc of testCases) {
      test(
        `${tc.sender} → ${tc.expected}`,
        async () => {
          const result = await aiCategorizeSender({
            emailAccount,
            sender: tc.sender,
            previousEmails: tc.emails,
            categories: getCategories(),
          });

          const actual = result?.category ?? "none";
          const pass = actual === tc.expected;
          evalReporter.record({
            testName: `${tc.sender} → ${tc.expected}`,
            model: model.label,
            pass,
            expected: tc.expected,
            actual,
          });

          expect(result?.category).toBe(tc.expected);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getCategories() {
  return Object.values(defaultCategory)
    .filter((c) => c.enabled)
    .map((c) => ({ name: c.name, description: c.description }));
}
