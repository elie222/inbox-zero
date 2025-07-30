import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiDetectRecurringPattern } from "@/utils/ai/choose-rule/ai-detect-recurring-pattern";
import type { EmailForLLM } from "@/utils/types";
import { RuleName } from "@/utils/rule/consts";
import { getEmailAccount } from "@/__tests__/helpers";

// Run with: pnpm test-ai ai-detect-recurring-pattern

vi.mock("server-only", () => ({}));
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    trace: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/braintrust", () => ({
  Braintrust: class {
    insertToDataset() {}
  },
}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)(
  "detectRecurringPattern",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    function getRealisticRules() {
      return [
        {
          name: "To Reply",
          instructions: `Apply this to emails needing my direct response. Exclude:
- All automated notifications (LinkedIn, Facebook, GitHub, social media, marketing)
- System emails (order confirmations, calendar invites)

Only flag when someone:
- Asks me a direct question
- Requests information or action
- Needs my specific input
- Follows up on a conversation`,
        },
        {
          name: RuleName.Newsletter,
          instructions:
            "Newsletters: Regular content from publications, blogs, or services I've subscribed to",
        },
        {
          name: RuleName.Marketing,
          instructions:
            "Marketing: Promotional emails about products, services, sales, or offers",
        },
        {
          name: RuleName.Calendar,
          instructions:
            "Calendar: Any email related to scheduling, meeting invites, or calendar notifications",
        },
        {
          name: RuleName.Receipt,
          instructions:
            "Receipts: Purchase confirmations, payment receipts, transaction records or invoices",
        },
        {
          name: RuleName.Notification,
          instructions:
            "Notifications: Alerts, status updates, or system messages",
        },
      ];
    }

    function getNewsletterEmails(): EmailForLLM[] {
      return Array.from({ length: 7 }).map((_, i) => ({
        id: `newsletter-${i}`,
        from: "news@substack.com",
        to: "user@example.com",
        subject: `Weekly Newsletter #${i + 1}: Latest Updates`,
        content: `This is our weekly newsletter with the latest updates and insights. 
        
        Welcome to this week's edition!
        
        Here are the top stories:
        - Story 1
        - Story 2
        - Story 3
        
        Thanks for reading,
        The Newsletter Team`,
        date: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000), // Weekly newsletters
      }));
    }

    function getReceiptEmails(): EmailForLLM[] {
      return Array.from({ length: 6 }).map((_, i) => ({
        id: `receipt-${i}`,
        from: "receipts@amazon.com",
        to: "user@example.com",
        subject: `Your Amazon.com order #A${100_000 + i}`,
        content: `Thank you for your order!
        
        Order Details:
        Order #A${100_000 + i}
        Date: ${new Date(Date.now() - i * 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
        Total: $${(Math.random() * 100).toFixed(2)}
        
        Your order will be delivered on ${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}.
        
        Thank you for shopping with us!`,
        date: new Date(Date.now() - i * 14 * 24 * 60 * 60 * 1000),
      }));
    }

    function getCalendarEmails(): EmailForLLM[] {
      return Array.from({ length: 6 }).map((_, i) => ({
        id: `calendar-${i}`,
        from: "calendar-noreply@google.com",
        to: "user@example.com",
        subject: `Meeting: Weekly Team Sync ${i + 1}`,
        content: `You have a new calendar invitation:
        
        Event: Weekly Team Sync ${i + 1}
        Date: ${new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
        Time: 10:00 AM - 11:00 AM
        Location: Conference Room A / Zoom
        
        This is an automatically generated email. Please do not reply.`,
        date: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000),
      }));
    }

    function getNeedsReplyEmails(): EmailForLLM[] {
      return Array.from({ length: 6 }).map((_, i) => ({
        id: `reply-${i}`,
        from: `colleague${i + 1}@company.com`,
        to: "user@example.com",
        subject: `Question about the project ${i + 1}`,
        content: `Hi there,

        I was wondering if you could help me with something on the project?
        
        ${
          [
            "Could you review the document I sent yesterday?",
            "When do you think you'll have time to discuss the requirements?",
            "Do you have the latest version of the presentation?",
            "I need your input on the design proposal.",
            "Can we schedule a call to go over the feedback?",
            "Let me know what you think about the approach I suggested.",
          ][i % 6]
        }
        
        Thanks,
        Colleague ${i + 1}`,
        date: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000),
      }));
    }

    function getMixedInconsistentEmails(): EmailForLLM[] {
      return [
        {
          id: "email-1",
          from: "support@company.com",
          to: "user@example.com",
          subject: "Your support ticket #12345",
          content:
            "Your ticket has been updated. Please log in to view the status.",
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
        {
          id: "email-2",
          from: "support@company.com",
          to: "user@example.com",
          subject: "Invoice for March 2023",
          content: "Please find attached your invoice for March 2023.",
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          id: "email-3",
          from: "support@company.com",
          to: "user@example.com",
          subject: "Weekly Updates",
          content: "Check out our latest updates and news.",
          date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
        {
          id: "email-4",
          from: "support@company.com",
          to: "user@example.com",
          subject: "Upcoming Webinar",
          content: "Join our upcoming webinar on productivity tips.",
          date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        },
        {
          id: "email-5",
          from: "support@company.com",
          to: "user@example.com",
          subject: "Your account status",
          content: "Your account has been updated successfully.",
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
        {
          id: "email-6",
          from: "marketing@company6.com",
          to: "user@example.com",
          subject: "Special offer just for you",
          content: "Take advantage of our limited-time offer!",
          date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        },
      ];
    }

    function getDifferentContentEmails(): EmailForLLM[] {
      return Array.from({ length: 6 }).map((_, i) => ({
        id: `mixed-${i}`,
        from: "notifications@example.com",
        to: "user@example.com",
        subject: [
          "Your subscription is due",
          "Security alert: new login",
          "Document shared with you",
          "Your account has been updated",
          "Weekly summary report",
          "Action required: verify your information",
        ][i],
        content: `Various unrelated content for email #${i + 1}`,
        date: new Date(Date.now() - i * 5 * 24 * 60 * 60 * 1000),
      }));
    }

    test("detects newsletter pattern and suggests Newsletter rule", async () => {
      const result = await aiDetectRecurringPattern({
        emails: getNewsletterEmails(),
        emailAccount: getEmailAccount(),
        rules: getRealisticRules(),
      });

      console.debug("Newsletter pattern detection result:", result);

      expect(result?.matchedRule).toBe(RuleName.Newsletter);
      expect(result?.explanation).toBeDefined();
    });

    test("detects receipt pattern and suggests Receipt rule", async () => {
      const result = await aiDetectRecurringPattern({
        emails: getReceiptEmails(),
        emailAccount: getEmailAccount(),
        rules: getRealisticRules(),
      });

      console.debug("Receipt pattern detection result:", result);

      expect(result?.matchedRule).toBe(RuleName.Receipt);
      expect(result?.explanation).toBeDefined();
    });

    test("detects calendar pattern and suggests Calendar rule", async () => {
      const result = await aiDetectRecurringPattern({
        emails: getCalendarEmails(),
        emailAccount: getEmailAccount(),
        rules: getRealisticRules(),
      });

      console.debug("Calendar pattern detection result:", result);

      expect(result?.matchedRule).toBe(RuleName.Calendar);
      expect(result?.explanation).toBeDefined();
    });

    test("detects reply needed pattern and suggests To Reply rule", async () => {
      const result = await aiDetectRecurringPattern({
        emails: getNeedsReplyEmails(),
        emailAccount: getEmailAccount(),
        rules: getRealisticRules(),
      });

      console.debug("Reply needed pattern detection result:", result);

      expect(result?.matchedRule).toBe("To Reply");
      expect(result?.explanation).toBeDefined();
    });

    test("returns null for mixed inconsistent emails", async () => {
      const result = await aiDetectRecurringPattern({
        emails: getMixedInconsistentEmails(),
        emailAccount: getEmailAccount(),
        rules: getRealisticRules(),
      });

      console.debug("Mixed inconsistent emails result:", result);

      expect(result).toBeNull();
    });

    test("returns null or matches Notification rule for same sender but different types of content", async () => {
      const result = await aiDetectRecurringPattern({
        emails: getDifferentContentEmails(),
        emailAccount: getEmailAccount(),
        rules: getRealisticRules(),
      });

      console.debug("Same sender different content result:", result);

      expect(
        result === null || result?.matchedRule === RuleName.Notification,
      ).toBeTruthy();
    });
  },
  15_000,
);
