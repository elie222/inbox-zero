import { describe, it, expect, vi, beforeEach } from "vitest";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import {
  createMockEmailProvider,
  getMockParsedMessage,
  ErrorProviders,
} from "@/__tests__/mocks/email-provider.mock";
import { getEmailAccount } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import { handleOutboundMessage } from "@/utils/reply-tracker/handle-outbound";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: vi.fn((callback) => callback()),
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    newsletter: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));
vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/utils/assistant/is-assistant-email", () => ({
  isAssistantEmail: vi.fn().mockReturnValue(false),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  runColdEmailBlocker: vi
    .fn()
    .mockResolvedValue({ isColdEmail: false, reason: "hasPreviousEmail" }),
}));
vi.mock("@/utils/categorize/senders/categorize", () => ({
  categorizeSender: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: vi.fn(),
}));
vi.mock("@/utils/assistant/process-assistant-email", () => ({
  processAssistantEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/reply-tracker/handle-outbound", () => ({
  handleOutboundMessage: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("test");

describe("Provider Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getDefaultEmailAccount() {
    return {
      ...getEmailAccount(),
      autoCategorizeSenders: false,
    };
  }

  const baseOptions = {
    hasAutomationRules: false,
    hasAiAccess: false,
    rules: [],
    emailAccount: getDefaultEmailAccount(),
    logger,
  };

  describe("Gmail-specific errors", () => {
    it("handles Gmail 'not found' error gracefully (message was deleted)", async () => {
      const provider = ErrorProviders.gmailNotFound();

      // Should not throw - the error is caught and logged
      await expect(
        processHistoryItem(
          { messageId: "deleted-msg", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).resolves.toBeUndefined();
    });

    it("throws on Gmail rate limit errors (to be caught by webhook handler)", async () => {
      const provider = ErrorProviders.gmailRateLimit();

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("throws on Gmail quota exceeded errors", async () => {
      const provider = ErrorProviders.gmailQuotaExceeded();

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).rejects.toThrow("Quota exceeded");
    });
  });

  describe("Outlook-specific errors", () => {
    it("handles Outlook ErrorItemNotFound gracefully", async () => {
      const provider = ErrorProviders.outlookNotFound();

      // Should not throw - similar to Gmail not found
      await expect(
        processHistoryItem(
          { messageId: "deleted-msg", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).resolves.toBeUndefined();
    });

    it("throws on Outlook throttling errors", async () => {
      const provider = ErrorProviders.outlookThrottling();

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).rejects.toThrow("Too many requests");
    });
  });

  describe("OAuth/Auth errors", () => {
    it("throws on invalid_grant errors (caught higher up)", async () => {
      const provider = ErrorProviders.invalidGrant();

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).rejects.toThrow("invalid_grant");
    });
  });

  describe("Network errors", () => {
    it("throws on network errors (to trigger retry logic)", async () => {
      const provider = ErrorProviders.networkError();

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).rejects.toThrow("fetch failed");
    });
  });

  describe("Message processing", () => {
    it("skips messages not in inbox or sent", async () => {
      const provider = createMockEmailProvider({
        getMessage: vi.fn().mockResolvedValue(
          getMockParsedMessage({
            labelIds: ["TRASH"], // Not in INBOX or SENT
          }),
        ),
        isSentMessage: vi.fn().mockReturnValue(false),
      });

      await processHistoryItem(
        { messageId: "msg-123", threadId: "thread-123" },
        { ...baseOptions, provider },
      );

      // Should return early without processing
      expect(provider.blockUnsubscribedEmail).not.toHaveBeenCalled();
    });

    it("processes inbox messages correctly", async () => {
      const provider = createMockEmailProvider({
        getMessage: vi.fn().mockResolvedValue(
          getMockParsedMessage({
            labelIds: ["INBOX"],
          }),
        ),
        isSentMessage: vi.fn().mockReturnValue(false),
      });

      await processHistoryItem(
        { messageId: "msg-123", threadId: "thread-123" },
        { ...baseOptions, provider },
      );

      expect(provider.getMessage).toHaveBeenCalledWith("msg-123");
    });

    it("handles sent messages via handleOutboundMessage", async () => {
      const provider = createMockEmailProvider({
        getMessage: vi.fn().mockResolvedValue(
          getMockParsedMessage({
            labelIds: ["SENT"],
            headers: {
              from: "user@test.com",
              to: "recipient@example.com",
              subject: "Test",
              date: "2024-01-01",
            },
          }),
        ),
        isSentMessage: vi.fn().mockReturnValue(true),
      });

      await processHistoryItem(
        { messageId: "msg-123", threadId: "thread-123" },
        { ...baseOptions, provider },
      );

      expect(handleOutboundMessage).toHaveBeenCalled();
    });
  });

  describe("Error message detection", () => {
    it("handles Outlook ResourceNotFound error", async () => {
      const provider = createMockEmailProvider({
        getMessage: vi
          .fn()
          .mockRejectedValue(new Error("ResourceNotFound: Item not found")),
      });

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).resolves.toBeUndefined();
    });

    it("handles Outlook 'not found in the store' error", async () => {
      const provider = createMockEmailProvider({
        getMessage: vi
          .fn()
          .mockRejectedValue(new Error("The item was not found in the store")),
      });

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).resolves.toBeUndefined();
    });

    it("handles Outlook itemNotFound code", async () => {
      const provider = createMockEmailProvider({
        getMessage: vi.fn().mockRejectedValue(
          Object.assign(new Error("Not found"), {
            code: "itemNotFound",
          }),
        ),
      });

      await expect(
        processHistoryItem(
          { messageId: "msg-123", threadId: "thread-123" },
          { ...baseOptions, provider },
        ),
      ).resolves.toBeUndefined();
    });
  });
});
