import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";

const TIMEOUT = 15_000;

// Type for the email account with name property as expected by the function
type EmailAccountForDigest = EmailAccountWithAI & {
  name: string | null;
};

// Run with: pnpm test-ai TEST

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";

// Helper functions for common test data
function getEmailAccount(overrides = {}): EmailAccountForDigest {
  return {
    id: "email-account-id",
    userId: "user1",
    email: "user@test.com",
    about: "Software engineer working on email automation",
    name: "Test User",
    account: {
      provider: "gmail",
    },
    user: {
      aiModel: "gpt-4",
      aiProvider: "openai",
      aiApiKey: process.env.OPENAI_API_KEY || null,
    },
    ...overrides,
  };
}

function getTestEmail(overrides = {}): EmailForLLM {
  return {
    id: "email-id",
    from: "sender@example.com",
    to: "user@test.com",
    subject: "Test Email",
    content: "This is a test email content",
    ...overrides,
  };
}

describe.runIf(isAiTest)("aiSummarizeEmailForDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(
    "successfully summarizes email with order details",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "orders@example.com",
        subject: "Order Confirmation #12345",
        content:
          "Thank you for your order! Order #12345 has been confirmed. Date: 2024-03-20. Items: 3. Total: $99.99",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "order",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });

      // Verify the result has the expected structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");
      expect(typeof result?.content).toBe("string");
    },
    TIMEOUT,
  );

  test(
    "successfully summarizes email with meeting notes",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "team@example.com",
        subject: "Weekly Team Meeting Notes",
        content:
          "Hi team, Here are the notes from our weekly meeting: 1. Project timeline updated - Phase 1 completion delayed by 1 week 2. New team member joining next week 3. Client presentation scheduled for Friday",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "meeting",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });

      // Verify the result has the expected structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty("content");
      expect(typeof result?.content).toBe("string");
    },
    TIMEOUT,
  );

  test(
    "handles empty email content gracefully",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "empty@example.com",
        subject: "Empty Email",
        content: "",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "other",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles null message gracefully",
    async () => {
      const emailAccount = getEmailAccount();

      const result = await aiSummarizeEmailForDigest({
        ruleName: "other",
        emailAccount,
        messageToSummarize: null as any,
      });

      expect(result).toBeNull();
    },
    TIMEOUT,
  );

  test(
    "handles different user configurations",
    async () => {
      const emailAccount = getEmailAccount({
        about: "Marketing manager focused on customer engagement",
        name: "Marketing User",
      });

      const messageToSummarize = getTestEmail({
        from: "newsletter@company.com",
        subject: "Weekly Marketing Update",
        content:
          "This week's marketing metrics: Email open rate: 25%, Click-through rate: 3.2%, Conversion rate: 1.8%",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "newsletter",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles various email categories correctly",
    async () => {
      const emailAccount = getEmailAccount();
      const categories = ["invoice", "receipt", "travel", "notification"];

      for (const category of categories) {
        const messageToSummarize = getTestEmail({
          from: `${category}@example.com`,
          subject: `Test ${category} email`,
          content: `This is a test ${category} email with sample content`,
        });

        const result = await aiSummarizeEmailForDigest({
          ruleName: category,
          emailAccount,
          messageToSummarize,
        });

        console.debug(`Generated content for ${category}:\n`, result);

        expect(result).toMatchObject({
          content: expect.any(String),
        });
      }
    },
    TIMEOUT * 2,
  );

  test(
    "handles promotional emails appropriately",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "promotions@store.com",
        subject: "50% OFF Everything! Limited Time Only!",
        content:
          "Don't miss our biggest sale of the year! Everything is 50% off for the next 24 hours only!",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "marketing",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles direct messages to user in second person",
    async () => {
      const emailAccount = getEmailAccount();
      const messageToSummarize = getTestEmail({
        from: "hr@company.com",
        subject: "Your Annual Review is Due",
        content:
          "Hi Test User, Your annual performance review is due by Friday. Please complete the self-assessment form and schedule a meeting with your manager.",
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "hr",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );

  test(
    "handles edge case with very long email content",
    async () => {
      const emailAccount = getEmailAccount();
      const longContent = `${"This is a very long email content. ".repeat(
        100,
      )}End of long content.`;

      const messageToSummarize = getTestEmail({
        from: "long@example.com",
        subject: "Very Long Email",
        content: longContent,
      });

      const result = await aiSummarizeEmailForDigest({
        ruleName: "other",
        emailAccount,
        messageToSummarize,
      });

      console.debug("Generated content:\n", result);

      expect(result).toMatchObject({
        content: expect.any(String),
      });
    },
    TIMEOUT,
  );
});
