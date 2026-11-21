import { beforeEach, describe, expect, it, vi } from "vitest";
import { GmailLabel } from "@/utils/gmail/label";
import { trashMessage, trashThread, untrashThread } from "./trash";

vi.mock("@inboxzero/tinybird", () => ({
  publishDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/gmail/retry", () => ({
  withGmailRetry: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/utils/gmail/label", () => ({
  GmailLabel: {
    INBOX: "INBOX",
    SPAM: "SPAM",
    TRASH: "TRASH",
  },
  getLabel: vi.fn(),
  getOrCreateLabel: vi.fn(),
}));

import { getLabel, getOrCreateLabel } from "@/utils/gmail/label";

describe("gmail trash mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("trashThread", () => {
    it("moves thread to Gmail trash when reviewLabel is not configured", async () => {
      const trash = vi.fn().mockResolvedValue({ data: {} });
      const gmail = {
        users: {
          threads: {
            trash,
            modify: vi.fn(),
          },
        },
      } as never;

      await trashThread({
        gmail,
        threadId: "thread-123",
        ownerEmail: "user@example.com",
        actionSource: "user",
      });

      expect(trash).toHaveBeenCalledWith({
        userId: "me",
        id: "thread-123",
      });
      expect(getOrCreateLabel).not.toHaveBeenCalled();
    });

    it("moves thread to review label and removes INBOX when reviewLabel is provided", async () => {
      vi.mocked(getOrCreateLabel).mockResolvedValue({
        id: "label-review-id",
        name: "Review/Delete",
      });
      const modify = vi.fn().mockResolvedValue({ data: {} });
      const trash = vi.fn();
      const gmail = {
        users: {
          threads: {
            trash,
            modify,
          },
        },
      } as never;

      await trashThread({
        gmail,
        threadId: "thread-123",
        ownerEmail: "user@example.com",
        actionSource: "user",
        reviewLabel: "Review/Delete",
      });

      expect(getOrCreateLabel).toHaveBeenCalledWith({
        gmail,
        name: "Review/Delete",
      });
      expect(modify).toHaveBeenCalledWith({
        userId: "me",
        id: "thread-123",
        requestBody: {
          addLabelIds: ["label-review-id"],
          removeLabelIds: [GmailLabel.INBOX],
        },
      });
      expect(trash).not.toHaveBeenCalled();
    });
  });

  describe("untrashThread", () => {
    it("calls gmail untrash when reviewLabel is not configured", async () => {
      const untrash = vi.fn().mockResolvedValue({ data: {} });
      const gmail = {
        users: {
          threads: {
            untrash,
            modify: vi.fn(),
          },
        },
      } as never;

      await untrashThread({
        gmail,
        threadId: "thread-123",
      });

      expect(untrash).toHaveBeenCalledWith({
        userId: "me",
        id: "thread-123",
      });
    });

    it("removes review label and restores INBOX when reviewLabel is provided", async () => {
      vi.mocked(getLabel).mockResolvedValue({
        id: "label-review-id",
        name: "Review/Delete",
      });
      const modify = vi.fn().mockResolvedValue({ data: {} });
      const untrash = vi.fn();
      const gmail = {
        users: {
          threads: {
            untrash,
            modify,
          },
        },
      } as never;

      await untrashThread({
        gmail,
        threadId: "thread-123",
        reviewLabel: "Review/Delete",
      });

      expect(getLabel).toHaveBeenCalledWith({
        gmail,
        name: "Review/Delete",
      });
      expect(modify).toHaveBeenCalledWith({
        userId: "me",
        id: "thread-123",
        requestBody: {
          addLabelIds: [GmailLabel.INBOX],
          removeLabelIds: ["label-review-id"],
        },
      });
      expect(untrash).not.toHaveBeenCalled();
    });
  });

  describe("trashMessage", () => {
    it("calls gmail messages.trash when reviewLabel is not configured", async () => {
      const trash = vi.fn().mockResolvedValue({ data: {} });
      const gmail = {
        users: {
          messages: {
            trash,
            modify: vi.fn(),
          },
        },
      } as never;

      await trashMessage({
        gmail,
        messageId: "msg-123",
      });

      expect(trash).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-123",
      });
    });

    it("applies review label and removes INBOX on message when reviewLabel is provided", async () => {
      vi.mocked(getOrCreateLabel).mockResolvedValue({
        id: "label-review-id",
        name: "Review/Delete",
      });
      const modify = vi.fn().mockResolvedValue({ data: {} });
      const trash = vi.fn();
      const gmail = {
        users: {
          messages: {
            trash,
            modify,
          },
        },
      } as never;

      await trashMessage({
        gmail,
        messageId: "msg-123",
        reviewLabel: "Review/Delete",
      });

      expect(getOrCreateLabel).toHaveBeenCalledWith({
        gmail,
        name: "Review/Delete",
      });
      expect(modify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-123",
        requestBody: {
          addLabelIds: ["label-review-id"],
          removeLabelIds: [GmailLabel.INBOX],
        },
      });
      expect(trash).not.toHaveBeenCalled();
    });
  });
});
