import { describe, it, expect, vi } from "vitest";
import type { Message } from "@microsoft/microsoft-graph-types";
import { createTestLogger } from "@/__tests__/helpers";
import {
  buildOutlookSearchFallbackQuery,
  convertMessage,
  queryBatchMessages,
  queryMessagesWithAttachments,
  queryMessagesWithFilters,
  sanitizeOutlookSearchQuery,
  sanitizeKqlValue,
  sanitizeKqlFieldQuery,
  sanitizeKqlTextQuery,
} from "@/utils/outlook/message";
import type { OutlookClient } from "@/utils/outlook/client";

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

describe("queryBatchMessages", () => {
  it("rejects full URL page tokens outside Microsoft Graph", async () => {
    const api = vi.fn().mockReturnValue({ get: vi.fn() });
    const client = createCachedOutlookClient(api);

    await expect(
      queryBatchMessages(
        client,
        { pageToken: "http://169.254.169.254/latest/meta-data" },
        createTestLogger(),
      ),
    ).rejects.toThrow("Invalid Outlook page token");

    expect(api).not.toHaveBeenCalled();
  });

  it("uses metadata filters for unread category searches", async () => {
    const request = createMockMessagesRequest();
    const api = vi.fn().mockReturnValue(request);
    const client = createCachedOutlookClient(
      api,
      new Map([["Newsletter", "category-newsletter"]]),
    );

    await queryBatchMessages(
      client,
      {
        searchQuery: "",
        readState: "unread",
        categoryNames: ["Newsletter"],
        maxResults: 20,
      },
      createTestLogger(),
    );

    expect(request.search).not.toHaveBeenCalled();
    expect(request.filter).toHaveBeenCalledWith(
      "isRead eq false and categories/any(category: category eq 'Newsletter')",
    );
    expect(request.orderby).not.toHaveBeenCalled();
  });

  it("uses standalone unread query terms as metadata filters", async () => {
    const request = createMockMessagesRequest();
    const api = vi.fn().mockReturnValue(request);
    const client = createCachedOutlookClient(api);

    await queryBatchMessages(
      client,
      {
        searchQuery: "unread",
        maxResults: 20,
      },
      createTestLogger(),
    );

    expect(request.search).not.toHaveBeenCalled();
    expect(request.filter).toHaveBeenCalledWith("isRead eq false");
    expect(request.orderby).not.toHaveBeenCalled();
  });

  it("strips standalone unread from text search and filters the page", async () => {
    const request = createMockMessagesRequest();
    request.get.mockResolvedValue({
      value: [
        {
          id: "message-unread",
          conversationId: "thread-unread",
          isRead: false,
        },
        {
          id: "message-read",
          conversationId: "thread-read",
          isRead: true,
        },
      ],
    });
    const api = vi.fn().mockReturnValue(request);
    const client = createCachedOutlookClient(api);

    const result = await queryBatchMessages(
      client,
      {
        searchQuery: "unread newsletter",
        maxResults: 20,
      },
      createTestLogger(),
    );

    expect(request.search).toHaveBeenCalledWith('"newsletter"');
    expect(request.filter).not.toHaveBeenCalled();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.id).toBe("message-unread");
  });

  it("keeps category-looking words as text search without structured filters", async () => {
    const request = createMockMessagesRequest();
    const api = vi.fn().mockReturnValue(request);
    const client = createCachedOutlookClient(api);

    await queryBatchMessages(
      client,
      {
        searchQuery: "newsletter",
        maxResults: 20,
      },
      createTestLogger(),
    );

    expect(request.search).toHaveBeenCalledWith('"newsletter"');
    expect(request.filter).not.toHaveBeenCalled();
  });
});

describe("queryMessagesWithFilters", () => {
  it("rejects full URL page tokens outside Microsoft Graph", async () => {
    const api = vi.fn().mockReturnValue({ get: vi.fn() });
    const client = createCachedOutlookClient(api);

    await expect(
      queryMessagesWithFilters(
        client,
        { pageToken: "http://169.254.169.254/latest/meta-data" },
        createTestLogger(),
      ),
    ).rejects.toThrow("Invalid Outlook page token");

    expect(api).not.toHaveBeenCalled();
  });
});

describe("queryMessagesWithAttachments", () => {
  it("rejects full URL page tokens outside Microsoft Graph", async () => {
    const api = vi.fn().mockReturnValue({ get: vi.fn() });
    const client = createCachedOutlookClient(api);

    await expect(
      queryMessagesWithAttachments(
        client,
        { pageToken: "http://169.254.169.254/latest/meta-data" },
        createTestLogger(),
      ),
    ).rejects.toThrow("Invalid Outlook page token");

    expect(api).not.toHaveBeenCalled();
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

    it("falls back to plain text when a field query also includes extra terms", () => {
      const query = 'from:"Loren Rock" RockMedical "user list" OR userlist';
      const result = sanitizeOutlookSearchQuery(query);

      expect(result.sanitized).toBe(
        '"Loren Rock RockMedical user list userlist"',
      );
      expect(result.wasSanitized).toBe(true);
    });

    it("drops helper-only boolean field filters when collapsing complex queries", () => {
      const query =
        'from:"Loren Rock" (RockMedical OR "Rock Medical") hasattachments:true';
      const result = sanitizeOutlookSearchQuery(query);

      expect(result.sanitized).toBe('"Loren Rock RockMedical Rock Medical"');
      expect(result.wasSanitized).toBe(true);
    });
  });
});

describe("buildOutlookSearchFallbackQuery", () => {
  it("falls back from a fielded sender lookup to a plain-text sender search", () => {
    expect(buildOutlookSearchFallbackQuery("from:sender@example.com")).toBe(
      '"sender@example.com"',
    );
  });

  it("drops trailing helper filters when collapsing an Outlook sender query", () => {
    expect(
      buildOutlookSearchFallbackQuery(
        "from:sender@example.com received>=2026-04-20 unread",
      ),
    ).toBe('"sender@example.com"');
  });

  it("falls back from a subject field query to plain text", () => {
    expect(
      buildOutlookSearchFallbackQuery('subject:"Quarterly planning notes"'),
    ).toBe('"Quarterly planning notes"');
  });

  it("preserves read-state words when they are part of the quoted subject text", () => {
    expect(
      sanitizeOutlookSearchQuery('subject:"Unread weekly report" unread')
        .sanitized,
    ).toBe('"Unread weekly report"');
  });

  it("does not strip plain keyword text that happens to contain a comparison", () => {
    expect(buildOutlookSearchFallbackQuery('"price < 5"')).toBeNull();
    expect(sanitizeOutlookSearchQuery('"price < 5"').sanitized).toBe(
      '"price < 5"',
    );
  });

  it("returns null when the fallback would not change the query", () => {
    expect(buildOutlookSearchFallbackQuery("sender@example.com")).toBeNull();
  });
});

function createCachedOutlookClient(
  api: ReturnType<typeof vi.fn>,
  categoryMap = new Map<string, string>(),
): OutlookClient {
  return {
    getClient: () => ({ api }),
    getFolderIdCache: () => ({ inbox: "inbox-folder-id" }),
    setFolderIdCache: vi.fn(),
    getCategoryMapCache: () => categoryMap,
    setCategoryMapCache: vi.fn(),
  } as unknown as OutlookClient;
}

function createMockMessagesRequest() {
  const request = {
    select: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
    top: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    orderby: vi.fn().mockReturnThis(),
    search: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ value: [] }),
  };

  return request;
}
