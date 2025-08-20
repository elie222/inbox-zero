import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  aiAnalyzeLabelRemoval,
  LabelRemovalAction,
  type LabelRemovalAnalysis,
} from "@/utils/ai/label-analysis/analyze-label-removal";
import { GroupItemType } from "@prisma/client";

// Run with: pnpm test-ai analyze-label-removal

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("aiAnalyzeLabelRemoval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getEmailAccount(overrides = {}) {
    return {
      id: "test-account-id",
      userId: "test-user-id",
      email: "user@test.com",
      about: null,
      user: {
        aiProvider: null,
        aiModel: null,
        aiApiKey: null,
      },
      account: {
        provider: "gmail",
      },
      ...overrides,
    };
  }

  function getLabel(overrides = {}) {
    return {
      name: "To Reply",
      instructions: "Emails that require a response",
      ...overrides,
    };
  }

  function getEmail(overrides = {}) {
    return {
      id: "test-email-id",
      from: "sender@example.com",
      to: "user@test.com",
      subject: "Test Email Subject",
      content:
        "This is a test email body that contains some content for analysis.",
      date: new Date("2024-01-01T00:00:00Z"),
      attachments: [],
      ...overrides,
    };
  }

  function getTestData(overrides = {}) {
    return {
      label: getLabel(),
      email: getEmail(),
      emailAccount: getEmailAccount(),
      ...overrides,
    };
  }

  test("successfully analyzes label removal with valid input", async () => {
    const testData = getTestData();

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result).toMatchObject({
      action: expect.stringMatching(
        new RegExp(`^(${Object.values(LabelRemovalAction).join("|")})$`),
      ),
      reasoning: expect.any(String),
    });

    // Validate the reasoning is not empty
    expect(result.reasoning.length).toBeGreaterThan(10);
  }, 15_000);

  test("handles label with no instructions", async () => {
    const testData = getTestData({
      label: getLabel({ instructions: null }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.action).toBeDefined();
    expect(result.reasoning).toBeDefined();
  }, 15_000);

  test("handles email with minimal content", async () => {
    const testData = getTestData({
      email: getEmail({
        body: "Short email",
        snippet: "Short",
        headers: {
          from: "minimal@example.com",
          to: "user@test.com",
          subject: "Minimal",
          date: "2024-01-01T00:00:00Z",
        },
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.action).toBeDefined();
    expect(result.reasoning).toBeDefined();
  }, 15_000);

  test("handles different label types", async () => {
    const labels = [
      { name: "Newsletter", instructions: "Newsletter subscriptions" },
      { name: "Follow Up", instructions: "Emails requiring follow-up action" },
      { name: "Important", instructions: "High priority emails" },
    ];

    for (const label of labels) {
      const testData = getTestData({ label });
      const result = await aiAnalyzeLabelRemoval(testData);

      expect(result.action).toBeDefined();
      expect(result.reasoning).toBeDefined();
    }
  }, 30_000);

  test("handles different email content types", async () => {
    const emails = [
      getEmail({
        from: "newsletter@company.com",
        subject: "Weekly Newsletter",
        content: "This week's updates and news...",
      }),
      getEmail({
        from: "support@service.com",
        subject: "Support Request #123",
        content: "We've received your support request and are working on it...",
      }),
      getEmail({
        from: "noreply@system.com",
        subject: "System Notification",
        content: "Your account has been updated successfully.",
      }),
    ];

    for (const email of emails) {
      const testData = getTestData({ email });
      const result = await aiAnalyzeLabelRemoval(testData);

      expect(result.action).toBeDefined();
      expect(result.reasoning).toBeDefined();
    }
  }, 30_000);

  test("returns valid schema structure", async () => {
    const testData = getTestData();

    const result = await aiAnalyzeLabelRemoval(testData);

    // Validate required fields
    expect(result.action).toBeDefined();
    expect(result.reasoning).toBeDefined();

    // Validate action is one of the allowed values
    expect(Object.values(LabelRemovalAction)).toContain(result.action);

    // Validate optional fields if present
    if (result.patternType !== undefined) {
      expect(Object.values(GroupItemType)).toContain(result.patternType);
    }

    if (result.patternValue !== undefined) {
      expect(typeof result.patternValue).toBe("string");
      expect(result.patternValue.length).toBeGreaterThan(0);
    }

    if (result.exclude !== undefined) {
      expect(typeof result.exclude).toBe("boolean");
    }
  }, 15_000);

  test("handles edge case with very long email content", async () => {
    const longContent = "This is a very long email body. ".repeat(100);
    const testData = getTestData({
      email: getEmail({ content: longContent }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.action).toBeDefined();
    expect(result.reasoning).toBeDefined();
  }, 15_000);

  test("handles email with special characters and formatting", async () => {
    const testData = getTestData({
      email: getEmail({
        subject: "Special Characters: @#$%^&*()_+{}|:<>?[]\\;'\"",
        content:
          "Email with special chars: @#$%^&*() and newlines\n\nAnd more content here.",
        from: "special+chars@example-domain.com",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.action).toBeDefined();
    expect(result.reasoning).toBeDefined();
  }, 15_000);

  test("handles different user AI configurations", async () => {
    const aiConfigs = [
      { aiModel: "gpt-4", aiProvider: "openai" },
      { aiModel: "gemini-2.0-flash", aiProvider: "google" },
      { aiModel: null, aiProvider: null },
    ];

    for (const config of aiConfigs) {
      const testData = getTestData({
        emailAccount: getEmailAccount({
          user: { ...config },
        }),
      });

      const result = await aiAnalyzeLabelRemoval(testData);

      expect(result.action).toBeDefined();
      expect(result.reasoning).toBeDefined();
    }
  }, 45_000);
});
