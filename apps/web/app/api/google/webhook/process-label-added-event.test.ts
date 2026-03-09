import { vi, describe, it, expect, beforeEach } from "vitest";
import { handleLabelAddedEvent } from "./process-label-added-event";
import type { gmail_v1 } from "@googleapis/gmail";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { extractEmailAddress } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";
import { GroupItemSource } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("test");

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    rule: {
      findFirst: vi.fn(),
    },
    groupItem: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/gmail/label", () => ({
  GmailLabel: {
    INBOX: "INBOX",
    SENT: "SENT",
    UNREAD: "UNREAD",
    STARRED: "STARRED",
    IMPORTANT: "IMPORTANT",
    SPAM: "SPAM",
    TRASH: "TRASH",
    DRAFT: "DRAFT",
  },
}));

vi.mock("@/utils/email", () => ({
  extractEmailAddress: vi.fn().mockReturnValue("sender@example.com"),
}));

vi.mock("@/utils/error", () => ({
  isGmailRateLimitExceededError: vi.fn().mockImplementation((error) => {
    return error?.errors?.[0]?.reason === "rateLimitExceeded";
  }),
  isGmailQuotaExceededError: vi.fn().mockImplementation((error) => {
    return error?.errors?.[0]?.reason === "quotaExceeded";
  }),
  isGmailInsufficientPermissionsError: vi.fn().mockReturnValue(false),
}));

describe("process-label-added-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createLabelAddedItem = (
    messageId = "123",
    threadId = "thread-123",
    labelIds = ["SPAM"],
  ) =>
    ({
      message: { id: messageId, threadId },
      labelIds,
    }) as gmail_v1.Schema$HistoryLabelAdded;

  const mockEmailAccount = {
    id: "email-account-id",
    email: "user@test.com",
  } as any;

  const mockProvider = {
    getMessage: vi.fn().mockResolvedValue({
      headers: { from: "sender@example.com" },
    }),
  } as any;

  const defaultOptions = {
    emailAccount: mockEmailAccount,
    provider: mockProvider,
  };

  describe("handleLabelAddedEvent", () => {
    it("should save cold email pattern when SPAM label is added", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
      } as any);

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).toHaveBeenCalledWith({
        emailAccountId: "email-account-id",
        from: "sender@example.com",
        ruleId: "rule-123",
        exclude: false,
        logger: expect.anything(),
        messageId: "123",
        threadId: "thread-123",
        reason: "Marked as spam by user",
        source: GroupItemSource.LABEL_ADDED,
      });
    });

    it("should skip when added label is not SPAM", async () => {
      await handleLabelAddedEvent(
        createLabelAddedItem("123", "thread-123", ["STARRED"]),
        defaultOptions,
        logger,
      );

      expect(prisma.rule.findFirst).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip when no Cold Email rule exists", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue(null);

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip when messageId is missing", async () => {
      const item = {
        message: { threadId: "thread-123" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelAdded;

      await handleLabelAddedEvent(item, defaultOptions, logger);

      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip when threadId is missing", async () => {
      const item = {
        message: { id: "123" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelAdded;

      await handleLabelAddedEvent(item, defaultOptions, logger);

      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should handle message not found gracefully", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
      } as any);
      mockProvider.getMessage.mockRejectedValueOnce(
        new Error("Requested entity was not found."),
      );

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should handle rate limit error gracefully", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
      } as any);
      mockProvider.getMessage.mockRejectedValueOnce(
        Object.assign(new Error("Rate limit exceeded"), {
          errors: [{ reason: "rateLimitExceeded" }],
        }),
      );

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip when sender cannot be extracted", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
      } as any);
      vi.mocked(extractEmailAddress).mockReturnValueOnce(null as any);

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip when sender already exists in cold email group", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
        groupId: "group-123",
      } as any);
      vi.mocked(prisma.groupItem.findUnique).mockResolvedValue({
        id: "existing-item",
      } as any);

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should save pattern when group exists but sender is new", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
        groupId: "group-123",
      } as any);
      vi.mocked(prisma.groupItem.findUnique).mockResolvedValue(null);

      await handleLabelAddedEvent(
        createLabelAddedItem(),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: "rule-123",
          exclude: false,
          source: GroupItemSource.LABEL_ADDED,
        }),
      );
    });
  });
});
