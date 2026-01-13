import { describe, it, expect } from "vitest";
import type { Message } from "@microsoft/microsoft-graph-types";
import { convertMessage } from "@/utils/outlook/message";

describe("convertMessage", () => {
  describe("category ID mapping", () => {
    it("should return category IDs when categoryMap is provided", () => {
      const message: Message = {
        id: "msg-123",
        conversationId: "thread-456",
        categories: ["Urgent", "To Reply"],
        isRead: true,
      };

      const categoryMap = new Map([
        ["Urgent", "uuid-urgent-123"],
        ["To Reply", "uuid-to-reply-456"],
      ]);

      const result = convertMessage(message, {}, categoryMap);

      expect(result.labelIds).toContain("uuid-urgent-123");
      expect(result.labelIds).toContain("uuid-to-reply-456");
      expect(result.labelIds).not.toContain("Urgent");
      expect(result.labelIds).not.toContain("To Reply");
    });

    it("should fall back to category name when not in categoryMap", () => {
      const message: Message = {
        id: "msg-123",
        conversationId: "thread-456",
        categories: ["Urgent", "Unknown Category"],
        isRead: true,
      };

      const categoryMap = new Map([["Urgent", "uuid-urgent-123"]]);

      const result = convertMessage(message, {}, categoryMap);

      expect(result.labelIds).toContain("uuid-urgent-123");
      expect(result.labelIds).toContain("Unknown Category");
    });

    it("should return category names when no categoryMap provided", () => {
      const message: Message = {
        id: "msg-123",
        conversationId: "thread-456",
        categories: ["Urgent", "To Reply"],
        isRead: true,
      };

      const result = convertMessage(message, {});

      expect(result.labelIds).toContain("Urgent");
      expect(result.labelIds).toContain("To Reply");
    });

    it("should handle empty categories array", () => {
      const message: Message = {
        id: "msg-123",
        conversationId: "thread-456",
        categories: [],
        isRead: true,
      };

      const categoryMap = new Map([["Urgent", "uuid-urgent-123"]]);

      const result = convertMessage(message, {}, categoryMap);

      expect(result.labelIds).not.toContain("uuid-urgent-123");
      expect(result.labelIds).not.toContain("Urgent");
    });

    it("should handle undefined categories", () => {
      const message: Message = {
        id: "msg-123",
        conversationId: "thread-456",
        isRead: true,
      };

      const categoryMap = new Map([["Urgent", "uuid-urgent-123"]]);

      const result = convertMessage(message, {}, categoryMap);

      expect(result.labelIds).toBeDefined();
    });

    it("should include system labels alongside category IDs", () => {
      const message: Message = {
        id: "msg-123",
        conversationId: "thread-456",
        categories: ["Urgent"],
        isRead: false,
        parentFolderId: "inbox-folder-id",
      };

      const folderIds = { inbox: "inbox-folder-id" };
      const categoryMap = new Map([["Urgent", "uuid-urgent-123"]]);

      const result = convertMessage(message, folderIds, categoryMap);

      expect(result.labelIds).toContain("UNREAD");
      expect(result.labelIds).toContain("INBOX");
      expect(result.labelIds).toContain("uuid-urgent-123");
    });
  });
});
