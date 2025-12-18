import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkSenderRuleHistory } from "@/utils/rule/check-sender-rule-history";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { getMockMessage, getMockExecutedRule } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

vi.mock("@/utils/prisma");

describe("checkSenderRuleHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockProvider = createMockEmailProvider();

  it("should return no consistent rule when no messages found from sender", async () => {
    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(0);
    expect(result.hasConsistentRule).toBe(false);
    expect(result.consistentRuleName).toBeUndefined();
    expect(mockProvider.getMessagesFromSender).toHaveBeenCalledWith({
      senderEmail: "test@example.com",
      maxResults: 50,
    });
  });

  it("should return consistent rule when all emails match the same rule", async () => {
    const mockMessages = [
      getMockMessage({
        id: "msg1",
        threadId: "thread1",
        subject: "Test 1",
        snippet: "Test message 1",
        textPlain: "Test content 1",
        textHtml: "<p>Test content 1</p>",
      }),
      getMockMessage({
        id: "msg2",
        threadId: "thread2",
        subject: "Test 2",
        snippet: "Test message 2",
        textPlain: "Test content 2",
        textHtml: "<p>Test content 2</p>",
      }),
      getMockMessage({
        id: "msg3",
        threadId: "thread3",
        subject: "Test 3",
        snippet: "Test message 3",
        textPlain: "Test content 3",
        textHtml: "<p>Test content 3</p>",
      }),
    ];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    const mockExecutedRules = [
      getMockExecutedRule({
        messageId: "msg1",
        threadId: "thread1",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
      getMockExecutedRule({
        messageId: "msg2",
        threadId: "thread2",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
      getMockExecutedRule({
        messageId: "msg3",
        threadId: "thread3",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
    ];

    prisma.executedRule.findMany.mockResolvedValue(mockExecutedRules as any);

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(3);
    expect(result.hasConsistentRule).toBe(true);
    expect(result.consistentRuleName).toBe("Newsletter");
    expect(result.ruleMatches.size).toBe(1);

    // Verify database query was called with correct message IDs
    expect(prisma.executedRule.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "test-email-account",
        status: "APPLIED",
        messageId: { in: ["msg1", "msg2", "msg3"] },
        rule: {
          enabled: true,
        },
      },
      select: {
        messageId: true,
        threadId: true,
        rule: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });

  it("should return no consistent rule when emails match different rules", async () => {
    const mockMessages = [
      getMockMessage({
        id: "msg1",
        threadId: "thread1",
        subject: "Test 1",
        snippet: "Test message 1",
      }),
      getMockMessage({
        id: "msg2",
        threadId: "thread2",
        subject: "Test 2",
        snippet: "Test message 2",
      }),
      getMockMessage({
        id: "msg3",
        threadId: "thread3",
        subject: "Test 3",
        snippet: "Test message 3",
      }),
    ];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    const mockExecutedRules = [
      getMockExecutedRule({
        messageId: "msg1",
        threadId: "thread1",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
      getMockExecutedRule({
        messageId: "msg2",
        threadId: "thread2",
        ruleId: "rule2",
        ruleName: "Calendar",
      }),
      getMockExecutedRule({
        messageId: "msg3",
        threadId: "thread3",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
    ];

    prisma.executedRule.findMany.mockResolvedValue(mockExecutedRules as any);

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(3);
    expect(result.hasConsistentRule).toBe(false);
    expect(result.consistentRuleName).toBeUndefined();
    expect(result.ruleMatches.size).toBe(2);

    // Verify both rules are counted
    const newsletterRule = result.ruleMatches.get("rule1");
    const calendarRule = result.ruleMatches.get("rule2");
    expect(newsletterRule?.count).toBe(2);
    expect(calendarRule?.count).toBe(1);
  });

  it("should handle messages with no executed rules", async () => {
    const mockMessages = [
      getMockMessage({
        id: "msg1",
        threadId: "thread1",
        subject: "Test 1",
        snippet: "Test message 1",
      }),
      getMockMessage({
        id: "msg2",
        threadId: "thread2",
        subject: "Test 2",
        snippet: "Test message 2",
      }),
    ];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    // No executed rules found for these messages
    prisma.executedRule.findMany.mockResolvedValue([]);

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(2); // 2 messages from sender
    expect(result.hasConsistentRule).toBe(false); // No rules applied
    expect(result.consistentRuleName).toBeUndefined();
    expect(result.ruleMatches.size).toBe(0);
  });

  it("should handle getMessagesFromSender errors gracefully", async () => {
    // Mock getMessagesFromSender to throw an error
    vi.mocked(mockProvider.getMessagesFromSender).mockRejectedValue(
      new Error("Failed to fetch messages from provider"),
    );

    await expect(
      checkSenderRuleHistory({
        emailAccountId: "test-email-account",
        from: "test@example.com",
        provider: mockProvider,
        logger,
      }),
    ).rejects.toThrow("Failed to fetch messages from provider");
  });

  it("should handle database query errors gracefully", async () => {
    const mockMessages = [getMockMessage({ id: "msg1", threadId: "thread1" })];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    // Mock database error
    prisma.executedRule.findMany.mockRejectedValue(
      new Error("Database connection failed"),
    );

    await expect(
      checkSenderRuleHistory({
        emailAccountId: "test-email-account",
        from: "test@example.com",
        provider: mockProvider,
        logger,
      }),
    ).rejects.toThrow("Database connection failed");
  });

  it("should extract email address from complex from field", async () => {
    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "John Doe <john@example.com>", // Complex from field
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.getMessagesFromSender).toHaveBeenCalledWith({
      senderEmail: "john@example.com", // Should extract just the email
      maxResults: 50,
    });
  });

  it("should handle executed rules without associated rule (deleted rules)", async () => {
    const mockMessages = [
      getMockMessage({ id: "msg1", threadId: "thread1" }),
      getMockMessage({ id: "msg2", threadId: "thread2" }),
    ];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    const mockExecutedRules = [
      getMockExecutedRule({
        messageId: "msg1",
        threadId: "thread1",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
      // Skip msg2 - simulates no executed rule found (rule was deleted)
    ];

    prisma.executedRule.findMany.mockResolvedValue(mockExecutedRules as any);

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(2);
    expect(result.ruleMatches.size).toBe(1); // Only one executed rule found
    expect(result.hasConsistentRule).toBe(true); // Only one rule type exists
  });

  it("should handle duplicate message IDs correctly", async () => {
    const mockMessages = [
      getMockMessage({ id: "msg1", threadId: "thread1" }),
      getMockMessage({ id: "msg2", threadId: "thread2" }),
      getMockMessage({ id: "msg3", threadId: "thread3" }),
    ];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    const mockExecutedRules = [
      getMockExecutedRule({
        messageId: "msg1",
        threadId: "thread1",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
      getMockExecutedRule({
        messageId: "msg1",
        threadId: "thread1",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }), // Duplicate
      getMockExecutedRule({
        messageId: "msg2",
        threadId: "thread2",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
    ];

    prisma.executedRule.findMany.mockResolvedValue(mockExecutedRules as any);

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(3);
    expect(result.ruleMatches.size).toBe(1);
    const newsletterRule = result.ruleMatches.get("rule1");
    expect(newsletterRule?.count).toBe(2); // Should not double-count msg1
  });

  it("should handle partial rule coverage", async () => {
    const mockMessages = [
      getMockMessage({ id: "msg1", threadId: "thread1" }),
      getMockMessage({ id: "msg2", threadId: "thread2" }),
    ];

    vi.mocked(mockProvider.getMessagesFromSender).mockResolvedValue({
      messages: mockMessages,
      nextPageToken: undefined,
    });

    // Only one message has an executed rule
    const mockExecutedRules = [
      getMockExecutedRule({
        messageId: "msg1",
        threadId: "thread1",
        ruleId: "rule1",
        ruleName: "Newsletter",
      }),
    ];

    prisma.executedRule.findMany.mockResolvedValue(mockExecutedRules as any);

    const result = await checkSenderRuleHistory({
      emailAccountId: "test-email-account",
      from: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result.totalEmails).toBe(2);
    expect(result.ruleMatches.size).toBe(1);
    expect(result.hasConsistentRule).toBe(true); // Single rule type
    expect(result.consistentRuleName).toBe("Newsletter");
  });
});
