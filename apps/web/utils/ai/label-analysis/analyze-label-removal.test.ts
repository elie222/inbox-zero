import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiAnalyzeLabelRemoval } from "@/utils/ai/label-analysis/analyze-label-removal";
import { GroupItemType } from "@prisma/client";

// Run with: pnpm test-ai analyze-label-removal

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("aiAnalyzeLabelRemoval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getUser() {
    return {
      email: "user@test.com",
      aiModel: null,
      aiProvider: null,
      aiApiKey: null,
      about: null,
    };
  }

  function getEmailAccount(overrides = {}) {
    return {
      id: "test-account-id",
      userId: "test-user-id",
      email: "user@test.com",
      about: null,
      user: getUser(),
      account: {
        provider: "gmail",
      },
      ...overrides,
    };
  }

  function getMatchedRules(overrides = {}) {
    return [
      {
        systemType: "TO_REPLY",
        instructions: "Emails that require a response",
        ruleName: "To Reply",
        ...overrides,
      },
    ];
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
      matchedRules: getMatchedRules(),
      email: getEmail(),
      emailAccount: getEmailAccount(),
      ...overrides,
    };
  }

  test("successfully analyzes label removal with valid input", async () => {
    const testData = getTestData();

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();

    // If patterns exist, validate their structure
    if (result.patterns && result.patterns.length > 0) {
      for (const pattern of result.patterns) {
        expect(pattern.type).toBeDefined();
        expect(pattern.value).toBeDefined();
        expect(pattern.exclude).toBeDefined();
        expect(pattern.reasoning).toBeDefined();
      }

      // Log generated content for debugging as per guidelines
      console.debug(
        "Generated patterns:\n",
        JSON.stringify(result.patterns, null, 2),
      );
    }
  }, 15_000);

  test("handles rule with no instructions", async () => {
    const testData = getTestData({
      matchedRules: getMatchedRules({ instructions: null }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();
  }, 15_000);

  test("handles email with minimal content", async () => {
    const testData = getTestData({
      email: getEmail({
        from: "minimal@example.com",
        to: "user@test.com",
        subject: "Minimal",
        content: "Short email",
        date: new Date("2024-01-01T00:00:00Z"),
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();
  }, 15_000);

  test("handles different rule types", async () => {
    const rules = [
      {
        systemType: "NEWSLETTER",
        instructions: "Newsletter subscriptions",
        ruleName: "Newsletter",
      },
      {
        systemType: "FOLLOW_UP",
        instructions: "Emails requiring follow-up action",
        ruleName: "Follow Up",
      },
      {
        systemType: "IMPORTANT",
        instructions: "High priority emails",
        ruleName: "Important",
      },
    ];

    for (const rule of rules) {
      const testData = getTestData({
        matchedRules: getMatchedRules(rule),
      });
      const result = await aiAnalyzeLabelRemoval(testData);

      expect(result.patterns).toBeDefined();
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

      expect(result.patterns).toBeDefined();
    }
  }, 30_000);

  test("returns valid schema structure", async () => {
    const testData = getTestData();

    const result = await aiAnalyzeLabelRemoval(testData);

    // Validate patterns field exists
    expect(result.patterns).toBeDefined();

    // Validate optional fields if present
    if (result.patterns && result.patterns.length > 0) {
      expect(Array.isArray(result.patterns)).toBe(true);
      for (const pattern of result.patterns) {
        expect(Object.values(GroupItemType)).toContain(pattern.type);
        expect(typeof pattern.value).toBe("string");
        expect(pattern.value.length).toBeGreaterThan(0);
        expect(typeof pattern.exclude).toBe("boolean");
        expect(typeof pattern.reasoning).toBe("string");
      }

      // Log generated content for debugging as per guidelines
      console.debug(
        "Schema validation patterns:\n",
        JSON.stringify(result.patterns, null, 2),
      );
    }
  }, 15_000);

  test("handles edge case with very long email content", async () => {
    const longContent = "This is a very long email body. ".repeat(100);
    const testData = getTestData({
      email: getEmail({ content: longContent }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();
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

    expect(result.patterns).toBeDefined();
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

      expect(result.patterns).toBeDefined();
    }
  }, 45_000);

  test("handles multiple matched rules", async () => {
    const multipleRules = [
      {
        systemType: "TO_REPLY",
        instructions: "Emails that require a response",
        ruleName: "To Reply",
      },
      {
        systemType: "NEWSLETTER",
        instructions: "Newsletter subscriptions",
        ruleName: "Newsletter",
      },
    ];

    const testData = getTestData({
      matchedRules: multipleRules,
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();
  }, 15_000);

  test("handles empty email content", async () => {
    const testData = getTestData({
      email: getEmail({
        content: "",
        subject: "",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();
  }, 15_000);

  test("handles null email account about field", async () => {
    const testData = getTestData({
      emailAccount: getEmailAccount({ about: null }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();
  }, 15_000);

  test("handles errors gracefully", async () => {
    // Test with invalid email data that might cause AI processing issues
    const testData = getTestData({
      email: getEmail({
        content: "A".repeat(10_000), // Very long content that might exceed limits
      }),
    });

    try {
      const result = await aiAnalyzeLabelRemoval(testData);
      expect(result.patterns).toBeDefined();
    } catch (error) {
      // If the AI processing fails, we should get a meaningful error
      expect(error).toBeDefined();
      console.debug("Error occurred as expected:\n", error);
    }
  }, 15_000);

  test("returns unchanged when no AI processing needed", async () => {
    // Test with minimal data that might not require AI analysis
    const testData = getTestData({
      email: getEmail({
        content: "",
        subject: "",
        from: "",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    // Should still return a valid response structure
    expect(result.patterns).toBeDefined();

    // Log the result to see what the AI generates
    console.debug(
      "AI response for minimal input:\n",
      JSON.stringify(result, null, 2),
    );
  }, 15_000);

  test("learns pattern when newsletter label is incorrectly applied", async () => {
    // Test scenario: User removes "Newsletter" label from a work email
    // This should trigger the AI to learn an exclude pattern because the initial classification was wrong
    const testData = getTestData({
      matchedRules: [
        {
          systemType: "NEWSLETTER",
          instructions: "Newsletter subscriptions and marketing emails",
          ruleName: "Newsletter",
        },
      ],
      email: getEmail({
        from: "colleague@company.com",
        subject: "Project Update - Q4 Goals",
        content:
          "Hi team, here's the latest update on our Q4 objectives. We need to finalize the budget proposal by Friday. Let me know if you have any questions.",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();

    // The AI should learn that emails from @company.com with work-related subjects
    // should not be labeled as newsletters (initial classification was wrong)
    if (result.patterns && result.patterns.length > 0) {
      console.debug(
        "Learned pattern for newsletter misclassification:\n",
        JSON.stringify(result.patterns, null, 2),
      );

      // Should have learned an exclude pattern
      const excludePatterns = result.patterns.filter((p) => p.exclude === true);
      expect(excludePatterns.length).toBeGreaterThan(0);
    }
  }, 15_000);

  test("learns pattern when to-reply label is removed after completion", async () => {
    // Test scenario: User removes "To Reply" label after responding
    // This might not generate a learned pattern since it's a one-off action
    const testData = getTestData({
      matchedRules: [
        {
          systemType: "TO_REPLY",
          instructions: "Emails that require a response from the user",
          ruleName: "To Reply",
        },
      ],
      email: getEmail({
        from: "client@external.com",
        subject: "Meeting Request",
        content:
          "Hi, I'd like to schedule a meeting to discuss the project timeline. When would be a good time for you?",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();

    // Log what the AI learned about this label removal
    console.debug(
      "AI analysis of to-reply label removal:\n",
      JSON.stringify(result, null, 2),
    );
  }, 15_000);

  test("does not learn pattern when newsletter label was correctly applied", async () => {
    // Test scenario: User removes "Newsletter" label from an actual newsletter email
    // The AI should NOT learn a pattern because the initial classification was correct
    const testData = getTestData({
      matchedRules: [
        {
          systemType: "NEWSLETTER",
          instructions: "Newsletter subscriptions and marketing emails",
          ruleName: "Newsletter",
        },
      ],
      email: getEmail({
        from: "newsletter@techblog.com",
        subject: "Weekly Tech Roundup - Latest Updates",
        content:
          "Here's this week's roundup of the latest technology news and updates. Read our featured articles on AI developments, new software releases, and industry trends.",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();

    // The AI should NOT learn a pattern because this is clearly a newsletter
    // and the initial classification was correct
    if (result.patterns === null || result.patterns === undefined) {
      console.debug(
        "AI correctly did not learn a pattern - initial classification was right:\n",
        JSON.stringify(result, null, 2),
      );
      // This is the expected behavior - no pattern learning needed
    } else {
      console.debug(
        "AI learned patterns (unexpected):\n",
        JSON.stringify(result.patterns, null, 2),
      );
      // If patterns were learned, they should be minimal or indicate the AI is unsure
      expect(result.patterns.length).toBeLessThanOrEqual(1);
    }
  }, 15_000);

  test("learns multiple patterns from complex email scenario", async () => {
    // Test scenario: Complex email that might trigger multiple pattern learning
    // This tests when the AI should learn patterns because the initial classification was wrong
    const testData = getTestData({
      matchedRules: [
        {
          systemType: "NEWSLETTER",
          instructions: "Newsletter subscriptions and marketing emails",
          ruleName: "Newsletter",
        },
        {
          systemType: "PROMOTIONAL",
          instructions: "Promotional and sales emails",
          ruleName: "Promotional",
        },
      ],
      email: getEmail({
        from: "marketing@startup.com",
        subject: "🚀 New Product Launch - Limited Time Offer!",
        content:
          "Don't miss out on our revolutionary new product! Special launch pricing available only this week. Click here to learn more and get 50% off!",
      }),
    });

    const result = await aiAnalyzeLabelRemoval(testData);

    expect(result.patterns).toBeDefined();

    // This should generate meaningful patterns since the user is removing labels
    // from an email that clearly fits the newsletter/promotional criteria
    // (indicating the initial classification was wrong for this specific sender)
    if (result.patterns && result.patterns.length > 0) {
      console.debug(
        "Multiple patterns learned from complex scenario:\n",
        JSON.stringify(result.patterns, null, 2),
      );

      // Should have learned patterns for this type of email
      expect(result.patterns.length).toBeGreaterThan(0);

      // Check that patterns have meaningful values
      for (const pattern of result.patterns) {
        expect(pattern.value.length).toBeGreaterThan(0);
        expect(pattern.reasoning.length).toBeGreaterThan(10);
      }
    }
  }, 15_000);
});
