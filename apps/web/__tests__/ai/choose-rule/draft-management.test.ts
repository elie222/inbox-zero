import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";

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
});
