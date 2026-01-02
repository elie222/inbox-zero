import { vi, describe, it, expect, beforeEach } from "vitest";
import { HistoryEventType } from "./types";
import { handleLabelRemovedEvent } from "./process-label-removed-event";
import type { gmail_v1 } from "@googleapis/gmail";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { createScopedLogger } from "@/utils/logger";
import { GroupItemSource } from "@/generated/prisma/enums";

const logger = createScopedLogger("test");

vi.mock("server-only", () => ({}));

// Mock dependencies
vi.mock("@/utils/prisma", () => ({
  default: {
    rule: {
      findUnique: vi.fn(),
    },
    groupItem: {
      deleteMany: vi.fn(),
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
      const historyItem = createLabelRemovedHistoryItem();

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).toHaveBeenCalledWith({
        emailAccountId: "email-account-id",
        from: "sender@example.com",
        ruleName: "Cold Email",
        exclude: true,
        logger: expect.anything(),
        messageId: "123",
        threadId: "thread-123",
        reason: "Label removed",
        source: GroupItemSource.USER,
      });
    });

    it("should skip learning when Newsletter label is removed (only Cold Email is supported)", async () => {
      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
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

    it("should skip processing when messageId is missing", async () => {
      const historyItem = {
        message: { threadId: "thread-123" }, // Missing messageId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });
});
