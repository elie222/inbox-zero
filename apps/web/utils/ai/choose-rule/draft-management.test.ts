import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  handlePreviousDraftDeletion,
  extractDraftPlainText,
  stripQuotedContent,
  stripQuotedHtmlContent,
  isDraftUnmodified,
} from "@/utils/ai/choose-rule/draft-management";
import prisma from "@/utils/prisma";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma", () => ({
  default: {
    executedAction: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const previousDraftAction = {
  id: "action-111",
  draftId: "draft-222",
  content: "Hello, this is a test draft",
};

const executedRule = {
  id: "rule-123",
  threadId: "thread-456",
  emailAccountId: "account-789",
};

describe("handlePreviousDraftDeletion", () => {
  const mockGetDraft = vi.fn();
  const mockDeleteDraft = vi.fn();
  const mockClient = {
    getDraft: mockGetDraft,
    deleteDraft: mockDeleteDraft,
  } as unknown as EmailProvider;
  const logger = createTestLogger();

  const mockFindFirst = prisma.executedAction.findFirst as Mock;
  const mockUpdate = prisma.executedAction.update as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete unmodified draft and update draft status", async () => {
    mockFindFirst.mockResolvedValue(previousDraftAction);
    mockGetDraft.mockResolvedValue(
      createParsedMessage({
        textPlain:
          "Hello, this is a test draft\n\nOn Monday wrote:\n> Previous message",
        snippet: "Hello, this is a test draft",
      }),
    );

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
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
    expectDraftCleanedUp({
      mockDeleteDraft,
      mockUpdate,
    });
  });

  it("should not delete modified draft", async () => {
    mockFindFirst.mockResolvedValue(previousDraftAction);
    mockGetDraft.mockResolvedValue(
      createParsedMessage({
        textPlain:
          "Hello, this is a MODIFIED draft\n\nOn Monday wrote:\n> Previous message",
        snippet: "Hello, this is a MODIFIED draft",
      }),
    );

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should not delete draft when original content is missing", async () => {
    mockFindFirst.mockResolvedValue({
      ...previousDraftAction,
      content: null,
    });
    mockGetDraft.mockResolvedValue(
      createParsedMessage({
        textPlain: "Potentially user modified draft",
        snippet: "Potentially user modified draft",
      }),
    );

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expect(mockGetDraft).toHaveBeenCalledWith("draft-222");
    expect(mockDeleteDraft).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should handle no previous draft found", async () => {
    mockFindFirst.mockResolvedValue(null);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expect(mockGetDraft).not.toHaveBeenCalled();
    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it("should handle draft not found in Gmail", async () => {
    mockFindFirst.mockResolvedValue(previousDraftAction);
    mockGetDraft.mockResolvedValue(null);

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    mockFindFirst.mockRejectedValue(new Error("Database error"));

    await expect(
      handlePreviousDraftDeletion({
        client: mockClient,
        executedRule,
        logger,
      }),
    ).resolves.not.toThrow();
  });

  it("should handle draft with no textPlain content", async () => {
    mockFindFirst.mockResolvedValue(previousDraftAction);
    mockGetDraft.mockResolvedValue(
      createParsedMessage({
        textPlain: undefined,
        textHtml: "<p>HTML content</p>",
        snippet: "HTML content",
      }),
    );

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });

  it("should handle Outlook HTML draft with signature link", async () => {
    mockFindFirst.mockResolvedValue({
      ...previousDraftAction,
      content:
        'Hello, this is a test draft\n\nDrafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.',
    });
    mockGetDraft.mockResolvedValue(
      createParsedMessage({
        textPlain:
          '<html><head>\r\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div dir="ltr">Hello, this is a test draft<br><br>Drafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 11 Nov 2025 at 2:18, John wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex; border-left:1px solid rgb(204,204,204); padding-left:1ex"><div dir="ltr">Previous message content</div></blockquote></div></body></html>',
        bodyContentType: "html",
        snippet: "Hello",
      }),
    );

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expectDraftCleanedUp({
      mockDeleteDraft,
      mockUpdate,
    });
  });

  it("should not delete when draft has extra user content", async () => {
    mockFindFirst.mockResolvedValue({
      ...previousDraftAction,
      content: "Original AI draft",
    });
    mockGetDraft.mockResolvedValue(
      createParsedMessage({
        textPlain:
          "Original AI draft\n\nUser added this extra paragraph.\n\nOn Monday wrote:\n> Quote",
      }),
    );

    await handlePreviousDraftDeletion({
      client: mockClient,
      executedRule,
      logger,
    });

    expect(mockDeleteDraft).not.toHaveBeenCalled();
  });
});

describe("extractDraftPlainText", () => {
  it.each([
    {
      name: "Gmail message without bodyContentType",
      message: createParsedMessage({
        textPlain: "Plain text content",
        textHtml: "<p>HTML content</p>",
      }),
      expected: "Plain text content",
    },
    {
      name: "message with text bodyContentType",
      message: createParsedMessage({
        textPlain: "Plain text content",
        bodyContentType: "text",
      }),
      expected: "Plain text content",
    },
    {
      name: "HTML message without textPlain",
      message: createParsedMessage({
        textPlain: undefined,
        bodyContentType: "html",
      }),
      expected: "",
    },
    {
      name: "empty textPlain",
      message: createParsedMessage({
        textPlain: "",
      }),
      expected: "",
    },
  ])("should return expected text for $name", ({ message, expected }) => {
    expect(extractDraftPlainText(message)).toBe(expected);
  });

  it("should convert HTML to plain text when bodyContentType is html", () => {
    const result = extractDraftPlainText(
      createParsedMessage({
        textPlain:
          '<p>HTML content with <a href="http://example.com">link</a></p>',
        bodyContentType: "html",
      }),
    );

    expect(result).toContain("HTML content");
    expect(result).toContain("link");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<a href");
  });

  it("should handle Outlook HTML with complex formatting", () => {
    const result = extractDraftPlainText(
      createParsedMessage({
        textPlain:
          '<html><body><div><strong>Bold</strong> and <em>italic</em> and <a href="http://example.com">link</a></div></body></html>',
        bodyContentType: "html",
      }),
    );

    expect(result).toContain("Bold");
    expect(result).toContain("italic");
    expect(result).toContain("link");
    expect(result).not.toContain("<strong>");
    expect(result).not.toContain("http://example.com");
  });
});

describe("stripQuotedContent", () => {
  it.each([
    {
      name: "On ... wrote:",
      text: "My reply\n\nOn Monday, John wrote:\n> Quoted content",
      expected: "My reply",
    },
    {
      name: "Original Message",
      text: "My reply\n\n---- Original Message ----\nFrom: test@example.com",
      expected: "My reply",
    },
    {
      name: "> quote",
      text: "My reply\n\n> On Monday:\n> Quoted content",
      expected: "My reply",
    },
    {
      name: "From:",
      text: "My reply\n\nFrom: sender@example.com\nQuoted content",
      expected: "My reply",
    },
    {
      name: "no quote patterns",
      text: "  Just a simple reply  ",
      expected: "Just a simple reply",
    },
    {
      name: "empty string",
      text: "",
      expected: "",
    },
    {
      name: "first matching pattern only",
      text: "My reply\n\nOn Monday wrote:\n> Quote 1\n\nFrom: test@example.com\n> Quote 2",
      expected: "My reply",
    },
    {
      name: "newlines without quotes",
      text: "Line 1\nLine 2\nLine 3",
      expected: "Line 1\nLine 2\nLine 3",
    },
    {
      name: "single-newline quote-like text",
      text: "My reply\nOn Monday wrote: something",
      expected: "My reply\nOn Monday wrote: something",
    },
    {
      name: "multiple consecutive newlines",
      text: "My reply\n\n\n\nOn Monday wrote:\n> Quote",
      expected: "My reply",
    },
  ])("should handle $name", ({ text, expected }) => {
    expect(stripQuotedContent(text)).toBe(expected);
  });
});

describe("stripQuotedHtmlContent", () => {
  it("removes Gmail quote containers without reading localized header text", () => {
    const html = `<div dir="ltr">My reply</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">Le lun. 27 avr. 2026, Sender a écrit:<br></div><blockquote class="gmail_quote"><div>Quoted content</div></blockquote></div>`;

    const result = stripQuotedHtmlContent(html);

    expect(result).toContain("My reply");
    expect(result).not.toContain("Le lun.");
    expect(result).not.toContain("Quoted content");
  });
});

describe("isDraftUnmodified", () => {
  const logger = createTestLogger();

  it.each([
    {
      name: "content matches exactly",
      originalContent: "Hello, this is a test",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("Hello, this is a test"),
      }),
      expected: true,
    },
    {
      name: "content is modified",
      originalContent: "Hello, this is a test",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("Hello, this is MODIFIED"),
      }),
      expected: false,
    },
    {
      name: "whitespace differs",
      originalContent: "  Hello, this is a test  ",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("Hello, this is a test"),
      }),
      expected: true,
    },
    {
      name: "original content is empty",
      originalContent: "",
      currentDraft: createParsedMessage({
        textPlain: "Some content",
      }),
      expected: false,
    },
    {
      name: "different quote pattern is present",
      originalContent: "My response",
      currentDraft: createParsedMessage({
        textPlain: "My response\n\n---- Original Message ----\nFrom: test",
      }),
      expected: true,
    },
    {
      name: "special characters are present",
      originalContent: "Reply with émojis 🎉 and spëcial çhars!",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("Reply with émojis 🎉 and spëcial çhars!"),
      }),
      expected: true,
    },
    {
      name: "content has multiple paragraph breaks",
      originalContent: "Paragraph 1\n\nParagraph 2\n\nParagraph 3",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("Paragraph 1\n\nParagraph 2\n\nParagraph 3"),
      }),
      expected: true,
    },
    {
      name: "user added content before quote",
      originalContent: "Original text",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("Original text\n\nUser added this"),
      }),
      expected: false,
    },
    {
      name: "draft has no quoted content",
      originalContent: "Just a reply",
      currentDraft: createParsedMessage({
        textPlain: "Just a reply",
      }),
      expected: true,
    },
    {
      name: "case differs",
      originalContent: "Hello World",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("hello world"),
      }),
      expected: false,
    },
    {
      name: "reply is only whitespace",
      originalContent: "   ",
      currentDraft: createParsedMessage({
        textPlain: withQuotedReply("   "),
      }),
      expected: true,
    },
  ])("should return $expected when $name", ({
    originalContent,
    currentDraft,
    expected,
  }) => {
    const result = isDraftUnmodified({
      originalContent,
      currentDraft,
      logger,
    });

    expect(result).toBe(expected);
  });

  it("should handle HTML content with links (Outlook case)", () => {
    const result = isDraftUnmodified({
      originalContent:
        'My reply\n\nDrafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.',
      currentDraft: createParsedMessage({
        textPlain:
          '<html><head>\r\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div dir="ltr">My reply<br><br>Drafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Tue, 11 Nov 2025 at 2:18, John wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex; border-left:1px solid rgb(204,204,204); padding-left:1ex"><div dir="ltr">Quote content</div></blockquote></div></body></html>',
        bodyContentType: "html",
      }),
      logger,
    });

    expect(result).toBe(true);
  });

  it("should compare Gmail drafts using structural HTML when available", () => {
    const result = isDraftUnmodified({
      originalContent:
        'My reply\n\nDrafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.',
      currentDraft: createParsedMessage({
        textPlain:
          "My reply\n\nDrafted by Inbox Zero [http://localhost:3000/?ref=ABC].\n\nLe lun. 27 avr. 2026, Sender a écrit:\nQuoted content",
        textHtml:
          '<div dir="ltr">My reply<br><br>Drafted by <a href="http://localhost:3000/?ref=ABC">Inbox Zero</a>.</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">Le lun. 27 avr. 2026, Sender a écrit:<br></div><blockquote class="gmail_quote"><div>Quoted content</div></blockquote></div>',
      }),
      logger,
    });

    expect(result).toBe(true);
  });
});

function createParsedMessage(
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage {
  return {
    id: "msg-123",
    threadId: "thread-456",
    textPlain: "Plain text content",
    textHtml: undefined,
    subject: "subject",
    date: "2024-01-01T12:00:00.000Z",
    snippet: "snippet",
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
    ...overrides,
  };
}

function withQuotedReply(reply: string): string {
  return `${reply}\n\nOn Monday wrote:\n> Quote`;
}

function expectDraftCleanedUp({
  mockDeleteDraft,
  mockUpdate,
}: {
  mockDeleteDraft: Mock;
  mockUpdate: Mock;
}) {
  expect(mockDeleteDraft).toHaveBeenCalledWith("draft-222");
  expect(mockUpdate).toHaveBeenCalledWith({
    where: { id: "action-111" },
    data: {
      draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
    },
  });
}
