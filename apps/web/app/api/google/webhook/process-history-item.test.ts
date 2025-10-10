import { describe, it, expect, vi, beforeEach } from "vitest";
import { processHistoryItem } from "./process-history-item";
import { HistoryEventType } from "./types";
import { NewsletterStatus } from "@prisma/client";
import type { gmail_v1 } from "@googleapis/gmail";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { GmailLabel } from "@/utils/gmail/label";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { getEmailAccount } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import { inboxZeroLabels } from "@/utils/label";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: vi.fn((callback) => callback()),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/utils/gmail/thread", () => ({
  getThreadMessages: vi.fn().mockImplementation(async (_gmail, threadId) => [
    {
      id: threadId === "thread-456" ? "456" : "123",
      threadId,
      labelIds: ["INBOX"],
      internalDate: "1704067200000", // 2024-01-01T00:00:00Z
      headers: {
        from: "sender@example.com",
        to: "user@test.com",
        subject: "Test Email",
        date: "2024-01-01T00:00:00Z",
      },
      body: "Hello World",
    },
  ]),
}));
vi.mock("@/utils/assistant/is-assistant-email", () => ({
  isAssistantEmail: vi.fn().mockReturnValue(false),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  runColdEmailBlocker: vi
    .fn()
    .mockResolvedValue({ isColdEmail: false, reason: "hasPreviousEmail" }),
}));
vi.mock("@/utils/categorize/senders/categorize", () => ({
  categorizeSender: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: vi.fn(),
}));
vi.mock("@/utils/assistant/process-assistant-email", () => ({
  processAssistantEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/digest/index", () => ({
  enqueueDigestItem: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({
    getMessage: vi.fn().mockImplementation(async (messageId) => ({
      id: messageId,
      threadId: messageId === "456" ? "thread-456" : "thread-123",
      labelIds: ["INBOX"],
      snippet: "Test email snippet",
      historyId: "12345",
      internalDate: "1704067200000",
      sizeEstimate: 1024,
      headers: {
        from: "sender@example.com",
        to: "user@test.com",
        subject: "Test Email",
        date: "2024-01-01T00:00:00Z",
      },
      textPlain: "Hello World",
      textHtml: "<b>Hello World</b>",
    })),
    blockUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
    isSentMessage: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock("@/utils/gmail/label", async () => {
  const actual = await vi.importActual("@/utils/gmail/label");
  return {
    ...actual,
    getLabelById: vi.fn().mockImplementation(async ({ id }: { id: string }) => {
      const labelMap: Record<string, { name: string }> = {
        "label-1": { name: inboxZeroLabels.cold_email.name },
        "label-2": { name: "Newsletter" },
        "label-3": { name: "Marketing" },
        "label-4": { name: "To Reply" },
      };
      return labelMap[id] || { name: "Unknown Label" };
    }),
  };
});

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: vi.fn().mockResolvedValue(undefined),
}));

describe("processHistoryItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createHistoryItem = (
    messageId = "123",
    threadId = "thread-123",
    type: HistoryEventType = HistoryEventType.MESSAGE_ADDED,
    labelIds?: string[],
  ) => {
    const baseItem = { message: { id: messageId, threadId } };

    if (type === HistoryEventType.LABEL_REMOVED) {
      return {
        type,
        item: {
          ...baseItem,
          labelIds: labelIds || [],
        } as gmail_v1.Schema$HistoryLabelRemoved,
      };
    } else if (type === HistoryEventType.LABEL_ADDED) {
      return {
        type,
        item: {
          ...baseItem,
          labelIds: labelIds || [],
        } as gmail_v1.Schema$HistoryLabelAdded,
      };
    } else {
      return {
        type,
        item: baseItem as gmail_v1.Schema$HistoryMessageAdded,
      };
    }
  };

  const defaultOptions = {
    gmail: {} as any,
    accessToken: "fake-token",
    hasAutomationRules: false,
    hasAiAccess: false,
    rules: [],
    history: [] as gmail_v1.Schema$History[],
  };

  function getDefaultEmailAccount() {
    return {
      ...getEmailAccount(),
      autoCategorizeSenders: false,
    };
  }

  it("should skip if message is already being processed", async () => {
    vi.mocked(markMessageAsProcessing).mockResolvedValueOnce(false);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };

    await processHistoryItem(createHistoryItem(), options);
  });

  it("should skip if message is an assistant email", async () => {
    vi.mocked(isAssistantEmail).mockReturnValueOnce(true);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };
    await processHistoryItem(createHistoryItem(), options);

    expect(processAssistantEmail).toHaveBeenCalledWith({
      message: expect.objectContaining({
        headers: expect.objectContaining({
          from: "sender@example.com",
          to: "user@test.com",
        }),
      }),
      userEmail: "user@test.com",
      emailAccountId: "email-account-id",
      provider: expect.any(Object),
    });
  });

  it("should skip if message is outbound", async () => {
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue({
        id: "123",
        threadId: "thread-123",
        labelIds: [GmailLabel.SENT],
        snippet: "Test email snippet",
        historyId: "12345",
        internalDate: "1704067200000",
        sizeEstimate: 1024,
        headers: {
          from: "user@test.com",
          to: "recipient@example.com",
          subject: "Test Email",
          date: "2024-01-01T00:00:00Z",
        },
        textPlain: "Hello World",
        textHtml: "<b>Hello World</b>",
      }),
      blockUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
      isSentMessage: vi.fn().mockReturnValue(true),
    };

    vi.mocked(createEmailProvider).mockResolvedValueOnce(mockProvider as any);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };
    await processHistoryItem(createHistoryItem(), options);
  });

  it("should skip if email is unsubscribed", async () => {
    const mockPrisma = await import("@/utils/prisma");
    vi.mocked(mockPrisma.default.newsletter.findFirst).mockResolvedValueOnce({
      id: "newsletter-123",
      email: "sender@example.com",
      status: NewsletterStatus.UNSUBSCRIBED,
      emailAccountId: "email-account-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      patternAnalyzed: false,
      lastAnalyzedAt: null,
      categoryId: null,
    });

    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue({
        id: "123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        snippet: "Test email snippet",
        historyId: "12345",
        internalDate: "1704067200000",
        sizeEstimate: 1024,
        headers: {
          from: "sender@example.com",
          to: "user@test.com",
          subject: "Test Email",
          date: "2024-01-01T00:00:00Z",
        },
        textPlain: "Hello World",
        textHtml: "<b>Hello World</b>",
      }),
      blockUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
      isSentMessage: vi.fn().mockReturnValue(false),
    };

    vi.mocked(createEmailProvider).mockResolvedValueOnce(mockProvider as any);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };
    await processHistoryItem(createHistoryItem(), options);

    expect(mockProvider.blockUnsubscribedEmail).toHaveBeenCalledWith("123");
  });
});
