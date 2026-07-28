import { vi, describe, it, expect, beforeEach } from "vitest";
import { handleLabelAddedEvent } from "./process-label-added-event";
import type { gmail_v1 } from "@googleapis/gmail";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { GroupItemSource } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import { fetchSenderFromMessage } from "@/utils/webhook/google/fetch-sender-from-message";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    rule: {
      findFirst: vi.fn(),
    },
    groupItem: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    executedAction: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/rule/classification-feedback", () => ({
  saveClassificationFeedback: vi.fn().mockResolvedValue(undefined),
  findRuleByLabelId: vi.fn().mockResolvedValue(null),
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
    PERSONAL: "CATEGORY_PERSONAL",
    SOCIAL: "CATEGORY_SOCIAL",
    PROMOTIONS: "CATEGORY_PROMOTIONS",
    FORUMS: "CATEGORY_FORUMS",
    UPDATES: "CATEGORY_UPDATES",
  },
  GMAIL_SYSTEM_LABELS: [
    "INBOX",
    "SENT",
    "DRAFT",
    "SPAM",
    "TRASH",
    "IMPORTANT",
    "STARRED",
    "UNREAD",
    "CATEGORY_PERSONAL",
    "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS",
    "CATEGORY_FORUMS",
    "CATEGORY_UPDATES",
  ],
}));

vi.mock("@/utils/webhook/google/fetch-sender-from-message", () => ({
  fetchSenderFromMessage: vi.fn().mockResolvedValue("sender@example.com"),
}));

vi.mock("@/utils/rule/consts", () => ({
  isEligibleForClassificationFeedback: vi.fn().mockReturnValue(true),
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
    getThreadMessages: vi.fn(),
    hasPreviousCommunicationsWithSenderOrDomain: vi.fn(),
  } as any;

  const defaultOptions = {
    emailAccount: mockEmailAccount,
    provider: mockProvider,
  };

  // The junked message is always "123" so it is found in the thread.
  const mockThreadSenders = (...senders: string[]) => {
    vi.mocked(mockProvider.getThreadMessages).mockResolvedValue(
      senders.map((from, index) => ({
        id: index === 0 ? "123" : `msg-${index}`,
        internalDate: "1700000000000",
        headers: { from },
      })),
    );
  };

  const junkMessage = () =>
    handleLabelAddedEvent(createLabelAddedItem(), defaultOptions, logger);

  describe("handleLabelAddedEvent", () => {
    beforeEach(() => {
      mockThreadSenders("sender@example.com");
      vi.mocked(fetchSenderFromMessage).mockResolvedValue("sender@example.com");
      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);
    });

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

    it("should skip when added label is a system label", async () => {
      await handleLabelAddedEvent(
        createLabelAddedItem("123", "thread-123", ["STARRED"]),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
      expect(saveClassificationFeedback).not.toHaveBeenCalled();
    });

    it("should skip when added label is a Gmail category label", async () => {
      await handleLabelAddedEvent(
        createLabelAddedItem("123", "thread-123", ["CATEGORY_PROMOTIONS"]),
        defaultOptions,
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
      expect(saveClassificationFeedback).not.toHaveBeenCalled();
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

    it("should skip when sender cannot be extracted", async () => {
      vi.mocked(fetchSenderFromMessage).mockResolvedValueOnce(null);

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

    describe("junking a thread", () => {
      beforeEach(() => {
        vi.mocked(prisma.rule.findFirst).mockResolvedValue({
          id: "rule-123",
        } as any);
      });

      it("should not learn any sender when the thread has replies from others", async () => {
        mockThreadSenders("replier@othercorp.com", "cold@vendor.com");
        vi.mocked(fetchSenderFromMessage).mockResolvedValue(
          "replier@othercorp.com",
        );

        await junkMessage();

        // Guards against passing via an earlier check instead of the thread inspection.
        expect(mockProvider.getThreadMessages).toHaveBeenCalled();
        expect(saveLearnedPattern).not.toHaveBeenCalled();
      });

      it("should not learn the sender when the user replied in the thread", async () => {
        mockThreadSenders("cold@vendor.com", "user@test.com");
        vi.mocked(fetchSenderFromMessage).mockResolvedValue("cold@vendor.com");

        await junkMessage();

        expect(saveLearnedPattern).not.toHaveBeenCalled();
      });

      it("should not learn a sender the user already corresponds with", async () => {
        mockThreadSenders("vendor@partner.com");
        vi.mocked(fetchSenderFromMessage).mockResolvedValue(
          "vendor@partner.com",
        );
        vi.mocked(
          mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
        ).mockResolvedValue(true);

        await junkMessage();

        expect(saveLearnedPattern).not.toHaveBeenCalled();
      });

      it("should learn the sole sender of a one-way thread", async () => {
        mockThreadSenders("cold@vendor.com", "cold@vendor.com");
        vi.mocked(fetchSenderFromMessage).mockResolvedValue("cold@vendor.com");

        await junkMessage();

        expect(saveLearnedPattern).toHaveBeenCalledWith(
          expect.objectContaining({ from: "cold@vendor.com" }),
        );
      });

      it("should only read the thread once when a whole thread is junked", async () => {
        mockThreadSenders("cold@vendor.com", "cold@vendor.com");
        vi.mocked(fetchSenderFromMessage).mockResolvedValue("cold@vendor.com");
        const spamLearnedThreadIds = new Set<string>();
        const options = { ...defaultOptions, spamLearnedThreadIds };

        // Gmail fires one event per message in the junked thread.
        await handleLabelAddedEvent(createLabelAddedItem(), options, logger);
        await handleLabelAddedEvent(
          createLabelAddedItem("456", "thread-123"),
          options,
          logger,
        );

        expect(mockProvider.getThreadMessages).toHaveBeenCalledTimes(1);
        expect(saveLearnedPattern).toHaveBeenCalledTimes(1);
      });

      it.each([
        ["the account has no cold email rule", null],
        ["the sender is already known", { id: "rule-123", groupId: "group-1" }],
      ])("should not read the thread when %s", async (_name, rule) => {
        vi.mocked(prisma.rule.findFirst).mockResolvedValue(rule as any);
        vi.mocked(prisma.groupItem.findUnique).mockResolvedValue({
          id: "existing-item",
        } as any);
        vi.mocked(fetchSenderFromMessage).mockResolvedValue("cold@vendor.com");

        await junkMessage();

        expect(mockProvider.getThreadMessages).not.toHaveBeenCalled();
      });
    });

    describe("internal senders", () => {
      beforeEach(() => {
        vi.mocked(prisma.rule.findFirst).mockResolvedValue({
          id: "rule-123",
        } as any);
      });

      // isSameOrganization returns before any provider call, so no thread setup is needed.
      it.each([
        ["the account owner's own address", "user@test.com"],
        ["a colleague on the account owner's domain", "ceo@test.com"],
      ])("should not learn %s", async (_name, sender) => {
        vi.mocked(fetchSenderFromMessage).mockResolvedValue(sender);

        await junkMessage();

        expect(saveLearnedPattern).not.toHaveBeenCalled();
      });
    });
  });
});
