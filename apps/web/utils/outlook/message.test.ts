import { describe, it, expect } from "vitest";
import type { Message } from "@microsoft/microsoft-graph-types";
import {
  convertMessage,
  sanitizeOutlookSearchQuery,
  sanitizeKqlValue,
  sanitizeKqlFieldQuery,
  sanitizeKqlTextQuery,
} from "@/utils/outlook/message";

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

describe("sanitizeKqlValue", () => {
  it("should return empty string for empty input", () => {
    expect(sanitizeKqlValue("")).toBe("");
    expect(sanitizeKqlValue("   ")).toBe("");
  });

  it("should replace ? with space", () => {
    expect(sanitizeKqlValue("hello?world")).toBe("hello world");
  });

  it("should escape backslashes", () => {
    expect(sanitizeKqlValue("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("should escape double quotes", () => {
    expect(sanitizeKqlValue('say "hello"')).toBe('say \\"hello\\"');
  });

  it("should normalize multiple spaces", () => {
    expect(sanitizeKqlValue("hello   world")).toBe("hello world");
  });

  it("should handle email addresses", () => {
    expect(sanitizeKqlValue("user@example.com")).toBe("user@example.com");
  });
});

describe("sanitizeKqlFieldQuery", () => {
  it("should return field:value without outer quotes", () => {
    expect(sanitizeKqlFieldQuery("participants:user@example.com")).toBe(
      "participants:user@example.com",
    );
  });

  it("should quote value with spaces", () => {
    expect(sanitizeKqlFieldQuery("subject:meeting notes")).toBe(
      'subject:"meeting notes"',
    );
  });

  it("should replace ? and quote if result has spaces", () => {
    expect(sanitizeKqlFieldQuery("from:user?name")).toBe('from:"user name"');
  });

  it("should escape backslashes in value", () => {
    expect(sanitizeKqlFieldQuery("subject:path\\file")).toBe(
      "subject:path\\\\file",
    );
  });

  it("should escape quotes in value", () => {
    expect(sanitizeKqlFieldQuery('subject:say "hi"')).toBe(
      'subject:"say \\"hi\\""',
    );
  });

  it("should handle empty value", () => {
    expect(sanitizeKqlFieldQuery("field:")).toBe("field:");
  });

  it("should handle query without colon", () => {
    expect(sanitizeKqlFieldQuery("nofield")).toBe("nofield");
  });
});

describe("sanitizeKqlTextQuery", () => {
  it("should wrap text in quotes", () => {
    expect(sanitizeKqlTextQuery("hello world")).toBe('"hello world"');
  });

  it("should remove internal quotes", () => {
    expect(sanitizeKqlTextQuery('say "hello"')).toBe('"say hello"');
  });

  it("should replace ? with space", () => {
    expect(sanitizeKqlTextQuery("hello?world")).toBe('"hello world"');
  });

  it("should escape backslashes", () => {
    expect(sanitizeKqlTextQuery("path\\to")).toBe('"path\\\\to"');
  });

  it("should normalize multiple spaces", () => {
    expect(sanitizeKqlTextQuery("hello    world")).toBe('"hello world"');
  });
});

describe("sanitizeOutlookSearchQuery", () => {
  describe("empty and whitespace inputs", () => {
    it("should return empty string for empty input", () => {
      const result = sanitizeOutlookSearchQuery("");
      expect(result.sanitized).toBe("");
      expect(result.wasSanitized).toBe(false);
    });

    it("should return empty string for whitespace-only input", () => {
      const result = sanitizeOutlookSearchQuery("   ");
      expect(result.sanitized).toBe("");
      expect(result.wasSanitized).toBe(false);
    });
  });

  describe("KQL field queries (field:value syntax)", () => {
    it("should NOT wrap participants:email in outer quotes", () => {
      const result = sanitizeOutlookSearchQuery(
        "participants:user@example.com",
      );
      expect(result.sanitized).toBe("participants:user@example.com");
      expect(result.wasSanitized).toBe(true);
    });

    it("should handle subject field query without outer quotes", () => {
      const result = sanitizeOutlookSearchQuery("subject:meeting");
      expect(result.sanitized).toBe("subject:meeting");
      expect(result.wasSanitized).toBe(true);
    });

    it("should quote value with spaces in field query", () => {
      const result = sanitizeOutlookSearchQuery("subject:meeting notes");
      expect(result.sanitized).toBe('subject:"meeting notes"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should handle ? in field query value by replacing with space", () => {
      const result = sanitizeOutlookSearchQuery("participants:user?name");
      expect(result.sanitized).toBe('participants:"user name"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should treat empty value after colon as text query", () => {
      const result = sanitizeOutlookSearchQuery("field:");
      expect(result.sanitized).toBe('"field:"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should escape backslashes in field value", () => {
      const result = sanitizeOutlookSearchQuery("subject:path\\file");
      expect(result.sanitized).toBe("subject:path\\\\file");
      expect(result.wasSanitized).toBe(true);
    });

    it("should escape quotes in field value and wrap if needed", () => {
      const result = sanitizeOutlookSearchQuery('subject:say "hello"');
      expect(result.sanitized).toBe('subject:"say \\"hello\\""');
      expect(result.wasSanitized).toBe(true);
    });
  });

  describe("regular text queries (no field:value syntax)", () => {
    it("should wrap simple query in quotes", () => {
      const result = sanitizeOutlookSearchQuery("simple query");
      expect(result.sanitized).toBe('"simple query"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should remove internal double quotes and wrap in outer quotes", () => {
      const result = sanitizeOutlookSearchQuery(
        'Reinstatement of "Universal policy" for "5161 Collins Ave"',
      );
      expect(result.sanitized).toBe(
        '"Reinstatement of Universal policy for 5161 Collins Ave"',
      );
      expect(result.wasSanitized).toBe(true);
    });

    it("should replace ? with space in text query", () => {
      const result = sanitizeOutlookSearchQuery("hello? world");
      expect(result.sanitized).toBe('"hello world"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should escape backslashes in text query", () => {
      const result = sanitizeOutlookSearchQuery("test\\path");
      expect(result.sanitized).toBe('"test\\\\path"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should normalize multiple spaces", () => {
      const result = sanitizeOutlookSearchQuery("hello    world");
      expect(result.sanitized).toBe('"hello world"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should handle single word queries", () => {
      const result = sanitizeOutlookSearchQuery("hello");
      expect(result.sanitized).toBe('"hello"');
      expect(result.wasSanitized).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle colon in middle of text (not at start)", () => {
      const result = sanitizeOutlookSearchQuery("meeting at 10:30am");
      expect(result.sanitized).toBe('"meeting at 10:30am"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should not treat URL-like strings as KQL fields", () => {
      const result = sanitizeOutlookSearchQuery("https://example.com");
      expect(result.sanitized).toBe('"https://example.com"');
      expect(result.wasSanitized).toBe(true);
    });

    it("should treat http: as text query, not KQL field", () => {
      const result = sanitizeOutlookSearchQuery("http://test.com");
      expect(result.sanitized).toBe('"http://test.com"');
      expect(result.wasSanitized).toBe(true);
    });
  });

  describe("real-world error cases", () => {
    it("should handle queries with internal quotes that caused unterminated string literal error", () => {
      const query =
        'Reinstatement of "Universal policy" for "123 Main St Apt #100"';
      const result = sanitizeOutlookSearchQuery(query);
      expect(result.sanitized).not.toContain('\\"');
      expect(result.sanitized).toBe(
        '"Reinstatement of Universal policy for 123 Main St Apt #100"',
      );
    });

    it("should handle the participants query that caused colon error", () => {
      const query = "participants:john.doe@company.example.com";
      const result = sanitizeOutlookSearchQuery(query);
      expect(result.sanitized).not.toMatch(/^"participants:/);
      expect(result.sanitized).toBe(
        "participants:john.doe@company.example.com",
      );
    });
  });
});
