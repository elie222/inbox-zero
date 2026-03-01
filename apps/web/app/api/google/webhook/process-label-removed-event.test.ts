import { vi, describe, it, expect, beforeEach } from "vitest";
import { HistoryEventType } from "./types";
import { handleLabelRemovedEvent } from "./process-label-removed-event";
import type { gmail_v1 } from "@googleapis/gmail";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { createScopedLogger } from "@/utils/logger";
import {
  GroupItemSource,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("test");

vi.mock("server-only", () => ({}));

// Mock dependencies
vi.mock("@/utils/prisma", () => ({
  default: {
    rule: {
      findFirst: vi.fn(),
    },
    groupItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    PERSONAL: "CATEGORY_PERSONAL",
    SOCIAL: "CATEGORY_SOCIAL",
    PROMOTIONS: "CATEGORY_PROMOTIONS",
    FORUMS: "CATEGORY_FORUMS",
    UPDATES: "CATEGORY_UPDATES",
  },
  getLabelById: vi.fn().mockImplementation(({ id }: { id: string }) => {
    const labelMap: Record<string, { name: string }> = {
      "label-1": { name: "Cold Email" },
      "label-2": { name: "Newsletter" },
      "label-3": { name: "Marketing" },
      "label-4": { name: "To Reply" },
    };
    return Promise.resolve(labelMap[id] || { name: "Unknown Label" });
  }),
}));

vi.mock("@/utils/email", () => ({
  extractEmailAddress: vi.fn().mockReturnValue("sender@example.com"),
}));

describe("process-label-removed-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createLabelRemovedHistoryItem = (
    messageId = "123",
    threadId = "thread-123",
    labelIds = ["label-1"],
  ) => ({
    type: HistoryEventType.LABEL_REMOVED,
    item: {
      message: { id: messageId, threadId },
      labelIds,
    } as gmail_v1.Schema$HistoryLabelRemoved,
  });

  const mockEmailAccount = {
    id: "email-account-id",
    email: "user@test.com",
  } as any;
  const mockProvider = {
    getMessage: vi.fn().mockResolvedValue({
      headers: {
        from: "sender@example.com",
      },
    }),
    getLabels: vi.fn().mockResolvedValue([
      { id: "label-1", name: "Cold Email", type: "user" },
      { id: "label-2", name: "Newsletter", type: "user" },
      { id: "label-3", name: "Marketing", type: "user" },
      { id: "label-4", name: "To Reply", type: "user" },
    ]),
  } as any;

  const defaultOptions = {
    emailAccount: mockEmailAccount,
    provider: mockProvider,
  };

  describe("handleLabelRemovedEvent", () => {
    it("should process Cold Email label removal and call saveLearnedPattern with exclude: true", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-123",
        systemType: SystemType.COLD_EMAIL,
      } as any);

      const historyItem = createLabelRemovedHistoryItem();

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).toHaveBeenCalledWith({
        emailAccountId: "email-account-id",
        from: "sender@example.com",
        ruleId: "rule-123",
        exclude: true,
        logger: expect.anything(),
        messageId: "123",
        threadId: "thread-123",
        reason: "Label removed",
        source: GroupItemSource.LABEL_REMOVED,
      });
    });

    it("should skip learning when To Reply label is removed (not a learnable rule)", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-456",
        systemType: SystemType.TO_REPLY,
      } as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-4",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when only system labels are removed", async () => {
      const historyItem = {
        message: { id: "msg-123", threadId: "thread-123" },
        labelIds: ["INBOX", "UNREAD"], // Only system labels
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      // Should not try to fetch the message when only system labels removed
      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when DRAFT label is removed (prevents 404 errors)", async () => {
      const historyItem = {
        message: { id: "draft-123", threadId: "thread-123" },
        labelIds: ["DRAFT"], // Draft was sent - message no longer exists
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when messageId is missing", async () => {
      const historyItem = {
        message: { threadId: "thread-123" }, // Missing messageId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when threadId is missing", async () => {
      const historyItem = {
        message: { id: "123" }, // Missing threadId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should handle multiple label removals in a single event", async () => {
      vi.mocked(prisma.rule.findFirst)
        .mockResolvedValueOnce({
          id: "rule-1",
          systemType: SystemType.COLD_EMAIL,
        } as any)
        .mockResolvedValueOnce({
          id: "rule-2",
          systemType: SystemType.NEWSLETTER,
        } as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-1",
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).toHaveBeenCalledTimes(2);
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-1" }),
      );
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-2" }),
      );
    });

    it("should skip learning when no rule is found for the removed label", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue(null);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "unknown-label",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });

  describe("undoSpamLearning", () => {
    it("should undo spam learning when SPAM label is removed", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-1",
        groupId: "group-1",
      } as any);
      vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 1 });

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
        where: {
          groupId: "group-1",
          type: GroupItemType.FROM,
          value: "sender@example.com",
          source: GroupItemSource.LABEL_ADDED,
        },
      });
    });

    it("should not undo spam learning when no Cold Email rule exists", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue(null);

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.groupItem.deleteMany).not.toHaveBeenCalled();
    });

    it("should not undo spam learning when Cold Email rule has no groupId", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-1",
        groupId: null,
      } as any);

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.groupItem.deleteMany).not.toHaveBeenCalled();
    });

    it("should handle SPAM removal + custom label removal in same event", async () => {
      // First call: undoSpamLearning looks up cold email rule
      // Second call: learnFromRemovedLabel looks up rule for custom label
      vi.mocked(prisma.rule.findFirst)
        .mockResolvedValueOnce({
          id: "rule-cold",
          groupId: "group-cold",
        } as any)
        .mockResolvedValueOnce({
          id: "rule-newsletter",
          systemType: SystemType.NEWSLETTER,
        } as any);
      vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 1 });

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM", "label-2"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      // Should undo spam learning
      expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
        where: {
          groupId: "group-cold",
          type: GroupItemType.FROM,
          value: "sender@example.com",
          source: GroupItemSource.LABEL_ADDED,
        },
      });

      // Should also learn from custom label removal
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: "rule-newsletter",
          exclude: true,
          source: GroupItemSource.LABEL_REMOVED,
        }),
      );
    });

    it("should process SPAM-only removal (no custom labels)", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-1",
        groupId: "group-1",
      } as any);
      vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 1 });

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      // Should fetch message to get sender (not skip early)
      expect(mockProvider.getMessage).toHaveBeenCalledWith("msg-1");
      // Should call deleteMany for undo
      expect(prisma.groupItem.deleteMany).toHaveBeenCalled();
      // Should NOT call saveLearnedPattern (no custom labels to learn from)
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });
});
