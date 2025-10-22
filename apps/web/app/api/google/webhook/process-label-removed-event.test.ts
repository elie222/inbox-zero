import { vi, describe, it, expect, beforeEach } from "vitest";
import { ColdEmailStatus } from "@prisma/client";
import { HistoryEventType } from "./types";
import { handleLabelRemovedEvent } from "./process-label-removed-event";
import type { gmail_v1 } from "@googleapis/gmail";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

vi.mock("server-only", () => ({}));

// Mock dependencies
vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: vi.fn().mockResolvedValue(undefined),
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
    it("should process Cold Email label removal and update ColdEmail status", async () => {
      prisma.coldEmail.upsert.mockResolvedValue({} as any);

      const historyItem = createLabelRemovedHistoryItem();

      console.log("Test data:", JSON.stringify(historyItem.item, null, 2));

      try {
        await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);
      } catch (error) {
        console.error("Function error:", error);
        throw error;
      }

      expect(prisma.coldEmail.upsert).toHaveBeenCalledWith({
        where: {
          emailAccountId_fromEmail: {
            emailAccountId: "email-account-id",
            fromEmail: "sender@example.com",
          },
        },
        update: {
          status: ColdEmailStatus.USER_REJECTED_COLD,
        },
        create: {
          status: ColdEmailStatus.USER_REJECTED_COLD,
          fromEmail: "sender@example.com",
          emailAccountId: "email-account-id",
          messageId: "123",
          threadId: "thread-123",
        },
      });
    });

    it("should skip learning when Newsletter label is removed (only Cold Email is supported)", async () => {
      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPatterns).not.toHaveBeenCalled();
    });

    it("should skip learning when To Reply label is removed (only Cold Email is supported)", async () => {
      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-4",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPatterns).not.toHaveBeenCalled();
    });

    it("should skip learning when no executed rule exists (only Cold Email is supported)", async () => {
      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPatterns).not.toHaveBeenCalled();
    });

    it("should skip learning when no matching LABEL action is found (only Cold Email is supported)", async () => {
      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPatterns).not.toHaveBeenCalled();
    });

    it("should handle multiple label removals in a single event (only Cold Email is supported)", async () => {
      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-3",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPatterns).not.toHaveBeenCalled();
    });

    it("should skip processing when messageId is missing", async () => {
      const historyItem = {
        message: { threadId: "thread-123" }, // Missing messageId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.coldEmail.upsert).not.toHaveBeenCalled();
    });

    it("should skip processing when threadId is missing", async () => {
      const historyItem = {
        message: { id: "123" }, // Missing threadId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.coldEmail.upsert).not.toHaveBeenCalled();
    });
  });
});
