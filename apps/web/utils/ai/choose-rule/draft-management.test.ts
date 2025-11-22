import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  handlePreviousDraftDeletion,
  extractDraftPlainText,
  stripQuotedContent,
  isDraftUnmodified,
} from "@/utils/ai/choose-rule/draft-management";
import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedAction: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("handlePreviousDraftDeletion", () => {
  const mockGetDraft = vi.fn();
  const mockDeleteDraft = vi.fn();
  const mockClient = {
    getDraft: mockGetDraft,
    deleteDraft: mockDeleteDraft,
  } as unknown as EmailProvider;
  const logger = createScopedLogger("test");
  const mockExecutedRule = {
    id: "rule-123",
    threadId: "thread-456",
    emailAccountId: "account-789",
  };

  const mockFindFirst = prisma.executedAction.findFirst as Mock;
  const mockUpdate = prisma.executedAction.update as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete unmodified draft and update wasDraftSent", async () => {
    const mockPreviousDraft = {
      id: "action-111",
      draftId: "draft-222",
      content: "Hello, this is a test draft",
    };

    const mockCurrentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        "Hello, this is a test draft\n\nOn Monday wrote:\n> Previous message",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "Hello, this is a test draft",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    mockFindFirst.mockResolvedValue(mockPreviousDraft);
    mockGetDraft.mockResolvedValue(mockCurrentDraft);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        executedRule: {
          threadId: "thread-456",
          emailAccountId: "account-789",
        },
        type: ActionType.DRAFT_EMAIL,
        draftId: { not: null },
        executedRuleId: { not: "rule-123" },
        draftSendLog: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        draftId: true,
        content: true,
      },
    });

    expect(mockGetDraft).toHaveBeenCalledWith("draft-222");
    expect(mockDeleteDraft).toHaveBeenCalledWith("draft-222");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "action-111" },
      data: { wasDraftSent: false },
    });
  });

  it("should not delete modified draft", async () => {
    const mockPreviousDraft = {
      id: "action-111",
      draftId: "draft-222",
      content: "Hello, this is a test draft",
    };

    const mockCurrentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        "Hello, this is a MODIFIED draft\n\nOn Monday wrote:\n> Previous message",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "Hello, this is a MODIFIED draft",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    mockFindFirst.mockResolvedValue(mockPreviousDraft);
    mockGetDraft.mockResolvedValue(mockCurrentDraft);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should handle no previous draft found", async () => {
    mockFindFirst.mockResolvedValue(null);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockGetDraft).not.toHaveBeenCalled();
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it("should handle draft not found in Gmail", async () => {
    const mockPreviousDraft = {
      id: "action-111",
      draftId: "draft-222",
      content: "Hello, this is a test draft",
    };

    mockFindFirst.mockResolvedValue(mockPreviousDraft);
    mockGetDraft.mockResolvedValue(null);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    const error = new Error("Database error");
    mockFindFirst.mockRejectedValue(error);

    // Should not throw - errors are caught and logged
    await expect(
      handlePreviousDraftDeletion({
        client: mockClient,
        executedRule: mockExecutedRule,
        logger,
      }),
    ).resolves.not.toThrow();
  });

  it("should handle draft with no textPlain content", async () => {
    const mockPreviousDraft = {
      id: "action-111",
      draftId: "draft-222",
      content: "Hello, this is a test draft",
    };

    const mockCurrentDraft = {
      id: "msg-123",
      threadId: "thread-456",
      // No textPlain property
      textHtml: "<p>HTML content</p>",
      snippet: "HTML content",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    mockFindFirst.mockResolvedValue(mockPreviousDraft);
    mockGetDraft.mockResolvedValue(mockCurrentDraft);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it("should handle Outlook HTML draft with signature link", async () => {
    const mockPreviousDraft = {
      id: "action-111",
      draftId: "draft-222",
      content:
        'Hello, this is a test draft\n\nDrafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.',
    };

    // Simulate real Outlook HTML output with proper structure
    const mockCurrentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        '<html><head>\r\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div dir="ltr">Hello, this is a test draft<br><br>Drafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 11 Nov 2025 at 2:18, John wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex; border-left:1px solid rgb(204,204,204); padding-left:1ex"><div dir="ltr">Previous message content</div></blockquote></div></body></html>',
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "Hello",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
      bodyContentType: "html",
    };

    mockFindFirst.mockResolvedValue(mockPreviousDraft);
    mockGetDraft.mockResolvedValue(mockCurrentDraft);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockDeleteDraft).toHaveBeenCalledWith("draft-222");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "action-111" },
      data: { wasDraftSent: false },
    });
  });

  it("should not delete when draft has extra user content", async () => {
    const mockPreviousDraft = {
      id: "action-111",
      draftId: "draft-222",
      content: "Original AI draft",
    };

    const mockCurrentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        "Original AI draft\n\nUser added this extra paragraph.\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    mockFindFirst.mockResolvedValue(mockPreviousDraft);
    mockGetDraft.mockResolvedValue(mockCurrentDraft);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule: mockExecutedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });
});

describe("extractDraftPlainText", () => {
  it("should return textPlain as-is for Gmail (no bodyContentType)", () => {
    const draft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Plain text content",
      textHtml: "<p>HTML content</p>",
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = extractDraftPlainText(draft);
    expect(result).toBe("Plain text content");
  });

  it("should return textPlain as-is when bodyContentType is text", () => {
    const draft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Plain text content",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
      bodyContentType: "text",
    };

    const result = extractDraftPlainText(draft);
    expect(result).toBe("Plain text content");
  });

  it("should convert HTML to plain text when bodyContentType is html", () => {
    const draft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        '<p>HTML content with <a href="http://example.com">link</a></p>',
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
      bodyContentType: "html",
    };

    const result = extractDraftPlainText(draft);
    // Should convert HTML to plain text and remove link URLs
    expect(result).toContain("HTML content");
    expect(result).toContain("link");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<a href");
  });

  it("should return empty string when textPlain is undefined", () => {
    const draft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: undefined,
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
      bodyContentType: "html",
    };

    const result = extractDraftPlainText(draft);
    expect(result).toBe("");
  });

  it("should handle empty string textPlain", () => {
    const draft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = extractDraftPlainText(draft);
    expect(result).toBe("");
  });

  it("should handle Outlook HTML with complex formatting", () => {
    const draft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        '<html><body><div><strong>Bold</strong> and <em>italic</em> and <a href="http://example.com">link</a></div></body></html>',
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
      bodyContentType: "html",
    };

    const result = extractDraftPlainText(draft);
    expect(result).toContain("Bold");
    expect(result).toContain("italic");
    expect(result).toContain("link");
    expect(result).not.toContain("<strong>");
    expect(result).not.toContain("http://example.com");
  });
});

describe("stripQuotedContent", () => {
  it("should strip content after 'On ... wrote:' pattern", () => {
    const text = "My reply\n\nOn Monday, John wrote:\n> Quoted content";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply");
  });

  it("should strip content after 'Original Message' pattern", () => {
    const text =
      "My reply\n\n---- Original Message ----\nFrom: test@example.com";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply");
  });

  it("should strip content after '>' quote pattern", () => {
    const text = "My reply\n\n> On Monday:\n> Quoted content";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply");
  });

  it("should strip content after 'From:' pattern", () => {
    const text = "My reply\n\nFrom: sender@example.com\nQuoted content";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply");
  });

  it("should return trimmed text when no quote patterns found", () => {
    const text = "  Just a simple reply  ";
    const result = stripQuotedContent(text);
    expect(result).toBe("Just a simple reply");
  });

  it("should handle empty string", () => {
    const result = stripQuotedContent("");
    expect(result).toBe("");
  });

  it("should only strip after first matching pattern", () => {
    const text =
      "My reply\n\nOn Monday wrote:\n> Quote 1\n\nFrom: test@example.com\n> Quote 2";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply");
  });

  it("should handle text with newlines but no quotes", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const result = stripQuotedContent(text);
    expect(result).toBe("Line 1\nLine 2\nLine 3");
  });

  it("should handle text that looks like a quote but isn't (single newline)", () => {
    const text = "My reply\nOn Monday wrote: something";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply\nOn Monday wrote: something");
  });

  it("should handle multiple consecutive newlines", () => {
    const text = "My reply\n\n\n\nOn Monday wrote:\n> Quote";
    const result = stripQuotedContent(text);
    expect(result).toBe("My reply");
  });
});

describe("isDraftUnmodified", () => {
  const logger = createScopedLogger("test");

  it("should return true when content matches exactly", () => {
    const originalContent = "Hello, this is a test";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Hello, this is a test\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should return false when content is modified", () => {
    const originalContent = "Hello, this is a test";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Hello, this is MODIFIED\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(false);
  });

  it("should handle HTML content with links (Outlook case)", () => {
    const originalContent =
      'My reply\n\nDrafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.';
    // Real Outlook HTML structure with proper gmail_quote formatting
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        '<html><head>\r\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div dir="ltr">My reply<br><br>Drafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 11 Nov 2025 at 2:18, John wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex; border-left:1px solid rgb(204,204,204); padding-left:1ex"><div dir="ltr">Quote content</div></blockquote></div></body></html>',
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
      bodyContentType: "html",
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should handle whitespace differences", () => {
    const originalContent = "  Hello, this is a test  ";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Hello, this is a test\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should return false when original content is empty string", () => {
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Some content",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent: "",
      currentDraft,
      logger,
    });

    expect(result).toBe(false);
  });

  it("should handle different quote patterns", () => {
    const originalContent = "My response";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "My response\n\n---- Original Message ----\nFrom: test",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should handle special characters in content", () => {
    const originalContent = "Reply with émojis 🎉 and spëcial çhars!";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        "Reply with émojis 🎉 and spëcial çhars!\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should handle content with multiple paragraph breaks", () => {
    const originalContent = "Paragraph 1\n\nParagraph 2\n\nParagraph 3";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        "Paragraph 1\n\nParagraph 2\n\nParagraph 3\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should detect modification when user adds content before quote", () => {
    const originalContent = "Original text";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain:
        "Original text\n\nUser added this\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(false);
  });

  it("should handle draft without any quoted content", () => {
    const originalContent = "Just a reply";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "Just a reply",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });

  it("should be case-sensitive", () => {
    const originalContent = "Hello World";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "hello world\n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(false);
  });

  it("should handle draft with only whitespace as reply", () => {
    const originalContent = "   ";
    const currentDraft: ParsedMessage = {
      id: "msg-123",
      threadId: "thread-456",
      textPlain: "   \n\nOn Monday wrote:\n> Quote",
      textHtml: undefined,
      subject: "subject",
      date: new Date().toISOString(),
      snippet: "snippet",
      historyId: "12345",
      internalDate: "1234567890",
      headers: {
        from: "test@example.com",
        to: "recipient@example.com",
        subject: "Test",
        date: "Mon, 1 Jan 2024 12:00:00 +0000",
      },
      labelIds: [],
      inline: [],
    };

    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(true);
  });
});
