import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { createScopedLogger } from "@/utils/logger";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { DigestEmailSummarySchema } from "@/app/api/resend/digest/validation";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";

// Run with: pnpm test-ai TEST

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("aiSummarizeEmailForDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("summarizes email with structured data", async () => {
    const emailAccount: EmailAccountWithAI = {
      id: "email-account-id",
      userId: "user1",
      email: "user@test.com",
      about: null,
      user: {
        aiModel: "gpt-4",
        aiProvider: "openai",
        aiApiKey: process.env.OPENAI_API_KEY || null,
      },
    };

    const messageToSummarize: EmailForLLM = {
      id: "email-id",
      from: "orders@example.com",
      to: "user@test.com",
      subject: "Order Confirmation #12345",
      content:
        "Thank you for your order! Order #12345 has been confirmed. Date: 2024-03-20. Items: 3. Total: $99.99",
    };

    const result = await aiSummarizeEmailForDigest({
      ruleName: "order",
      emailAccount,
      messageToSummarize,
    });

    console.debug("Generated content:\n", result);

    expect(result).toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({
          label: expect.any(String),
          value: expect.any(String),
        }),
      ]),
    });
  }, 15_000);

  test("summarizes email with unstructured content", async () => {
    const emailAccount: EmailAccountWithAI = {
      id: "email-account-id",
      userId: "user1",
      email: "user@test.com",
      about: null,
      user: {
        aiModel: "gpt-4",
        aiProvider: "openai",
        aiApiKey: process.env.OPENAI_API_KEY || null,
      },
    };

    const messageToSummarize: EmailForLLM = {
      id: "email-id",
      from: "team@example.com",
      to: "user@test.com",
      subject: "Weekly Team Meeting Notes",
      content:
        "Hi team, Here are the notes from our weekly meeting: 1. Project timeline updated - Phase 1 completion delayed by 1 week 2. New team member joining next week 3. Client presentation scheduled for Friday",
    };

    const result = await aiSummarizeEmailForDigest({
      ruleName: "meeting",
      emailAccount,
      messageToSummarize,
    });

    console.debug("Generated content:\n", result);

    expect(result).toMatchObject({
      summary: expect.any(String),
    });
  }, 15_000);

  test("handles empty email content", async () => {
    const emailAccount: EmailAccountWithAI = {
      id: "email-account-id",
      userId: "user1",
      email: "user@test.com",
      about: null,
      user: {
        aiModel: "gpt-4",
        aiProvider: "openai",
        aiApiKey: process.env.OPENAI_API_KEY || null,
      },
    };

    const messageToSummarize: EmailForLLM = {
      id: "email-id",
      from: "empty@example.com",
      to: "user@test.com",
      subject: "Empty Email",
      content: "",
    };

    const result = await aiSummarizeEmailForDigest({
      ruleName: "other",
      emailAccount,
      messageToSummarize,
    });

    console.debug("Generated content:\n", result);

    // Empty emails should return null as they're not worth summarizing
    expect(result).toBeNull();
  }, 15_000);

  test("handles null message", async () => {
    const emailAccount: EmailAccountWithAI = {
      id: "email-account-id",
      userId: "user1",
      email: "user@test.com",
      about: null,
      user: {
        aiModel: "gpt-4",
        aiProvider: "openai",
        aiApiKey: process.env.OPENAI_API_KEY || null,
      },
    };

    const result = await aiSummarizeEmailForDigest({
      ruleName: "other",
      emailAccount,
      messageToSummarize: null as any,
    });

    expect(result).toBeNull();
  }, 15_000);

  test("ensures consistent output format", async () => {
    const emailAccount: EmailAccountWithAI = {
      id: "email-account-id",
      userId: "user1",
      email: "user@test.com",
      about: null,
      user: {
        aiModel: "gpt-4",
        aiProvider: "openai",
        aiApiKey: process.env.OPENAI_API_KEY || null,
      },
    };

    const messageToSummarize: EmailForLLM = {
      id: "email-id",
      from: "invoice@example.com",
      to: "user@test.com",
      subject: "Invoice #INV-2024-001",
      content:
        "Invoice #INV-2024-001\nAmount: $150.00\nDue Date: 2024-04-01\nStatus: Pending",
    };

    const result = await aiSummarizeEmailForDigest({
      ruleName: "invoice",
      emailAccount,
      messageToSummarize,
    });

    console.debug("Generated content:\n", result);

    // Verify the result matches the schema
    const validationResult = DigestEmailSummarySchema.safeParse(result);
    expect(validationResult.success).toBe(true);
  }, 15_000);
});
