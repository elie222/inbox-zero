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
  it.each([
    ["empty input", "", ""],
    ["whitespace-only input", "   ", ""],
    ["question marks", "hello?world", "hello world"],
    ["backslashes", "path\\to\\file", "path\\\\to\\\\file"],
    ["double quotes", 'say "hello"', 'say \\"hello\\"'],
    ["multiple spaces", "hello   world", "hello world"],
    ["email addresses", "user@example.com", "user@example.com"],
  ])("handles %s", (_name, input, expected) => {
    expect(sanitizeKqlValue(input)).toBe(expected);
  });
});

describe("sanitizeKqlFieldQuery", () => {
  it.each([
    [
      "field:value without outer quotes",
      "participants:user@example.com",
      "participants:user@example.com",
    ],
    ["value with spaces", "subject:meeting notes", 'subject:"meeting notes"'],
    ["question mark in value", "from:user?name", 'from:"user name"'],
    ["backslashes in value", "subject:path\\file", "subject:path\\\\file"],
    ["quotes in value", 'subject:say "hi"', 'subject:"say \\"hi\\""'],
    ["empty value", "field:", "field:"],
    ["query without colon", "nofield", "nofield"],
  ])("handles %s", (_name, input, expected) => {
    expect(sanitizeKqlFieldQuery(input)).toBe(expected);
  });
});

describe("sanitizeKqlTextQuery", () => {
  it.each([
    ["text", "hello world", '"hello world"'],
    ["internal quotes", 'say "hello"', '"say hello"'],
    ["question marks", "hello?world", '"hello world"'],
    ["backslashes", "path\\to", '"path\\\\to"'],
    ["multiple spaces", "hello    world", '"hello world"'],
  ])("handles %s", (_name, input, expected) => {
    expect(sanitizeKqlTextQuery(input)).toBe(expected);
  });
});

describe("sanitizeOutlookSearchQuery", () => {
  describe("empty and whitespace inputs", () => {
    it.each([
      ["empty input", ""],
      ["whitespace-only input", "   "],
    ])("returns empty string for %s", (_name, input) => {
      expectSanitizedSearchQuery(input, "", false);
    });
  });

  describe("KQL field queries (field:value syntax)", () => {
    it.each([
      [
        "participants email",
        "participants:user@example.com",
        "participants:user@example.com",
      ],
      ["subject field", "subject:meeting", "subject:meeting"],
      [
        "field query value with spaces",
        "subject:meeting notes",
        'subject:"meeting notes"',
      ],
      [
        "question mark in field query value",
        "participants:user?name",
        'participants:"user name"',
      ],
      ["empty value after colon", "field:", '"field:"'],
      [
        "backslashes in field value",
        "subject:path\\file",
        "subject:path\\\\file",
      ],
      [
        "quotes in field value",
        'subject:say "hello"',
        'subject:"say \\"hello\\""',
      ],
    ])("handles %s", (_name, input, expected) => {
      expectSanitizedSearchQuery(input, expected);
    });
  });

  describe("regular text queries (no field:value syntax)", () => {
    it.each([
      ["simple query", "simple query", '"simple query"'],
      [
        "internal double quotes",
        'Reinstatement of "Universal policy" for "5161 Collins Ave"',
        '"Reinstatement of Universal policy for 5161 Collins Ave"',
      ],
      ["question mark in text query", "hello? world", '"hello world"'],
      ["backslashes in text query", "test\\path", '"test\\\\path"'],
      ["multiple spaces", "hello    world", '"hello world"'],
      ["single word query", "hello", '"hello"'],
    ])("handles %s", (_name, input, expected) => {
      expectSanitizedSearchQuery(input, expected);
    });
  });

  describe("edge cases", () => {
    it.each([
      ["colon in middle of text", "meeting at 10:30am", '"meeting at 10:30am"'],
      ["URL-like string", "https://example.com", '"https://example.com"'],
      ["http: prefix", "http://test.com", '"http://test.com"'],
    ])("handles %s", (_name, input, expected) => {
      expectSanitizedSearchQuery(input, expected);
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
  it.each([
    [
      "fielded sender lookup",
      "from:sender@example.com",
      '"sender@example.com"',
    ],
    [
      "Outlook sender query with trailing helper filters",
      "from:sender@example.com received>=2026-04-20 unread",
      '"sender@example.com"',
    ],
    [
      "subject field query",
      'subject:"Quarterly planning notes"',
      '"Quarterly planning notes"',
    ],
  ])("falls back from %s", (_name, query, expected) => {
    expect(buildOutlookSearchFallbackQuery(query)).toBe(expected);
  });

  it("preserves read-state words when they are part of the quoted subject text", () => {
    expect(
      sanitizeOutlookSearchQuery('subject:"Unread weekly report" unread')
        .sanitized,
    ).toBe('"Unread weekly report"');
  });

  it("does not strip plain keyword text that happens to contain a comparison", () => {
    expect(sanitizeOutlookSearchQuery('"price < 5"').sanitized).toBe(
      '"price < 5"',
    );
  });

  it.each([
    ["plain keyword text with comparison", '"price < 5"'],
    ["unchanged sender query", "sender@example.com"],
  ])("returns null for %s", (_name, query) => {
    expect(buildOutlookSearchFallbackQuery(query)).toBeNull();
  });
});

function expectSanitizedSearchQuery(
  query: string,
  sanitized: string,
  wasSanitized = true,
) {
  const result = sanitizeOutlookSearchQuery(query);
  expect(result.sanitized).toBe(sanitized);
  expect(result.wasSanitized).toBe(wasSanitized);
}

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
