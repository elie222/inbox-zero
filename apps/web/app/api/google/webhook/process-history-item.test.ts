import { describe, it, expect, vi, beforeEach } from "vitest";
import { processHistoryItem } from "./process-history-item";
import { HistoryEventType } from "./types";
import {
  DraftReplyConfidence,
  NewsletterStatus,
} from "@/generated/prisma/enums";
import type { gmail_v1 } from "@googleapis/gmail";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { GmailLabel } from "@/utils/gmail/label";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import { handleOutboundMessage } from "@/utils/reply-tracker/handle-outbound";

const logger = createTestLogger();

vi.mock("@/utils/prisma");
vi.mock("@/utils/redis/message-processing", () => ({
  acquireOutboundMessageLock: vi.fn().mockResolvedValue("lock-token-1"),
  clearOutboundMessageLock: vi.fn().mockResolvedValue(true),
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
  markOutboundMessageProcessed: vi.fn().mockResolvedValue(true),
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

vi.mock("@/utils/reply-tracker/handle-outbound", () => ({
  handleOutboundMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/gmail/label", async () => {
  const actual = await vi.importActual("@/utils/gmail/label");
  return {
    ...actual,
    getLabelById: vi.fn().mockImplementation(async ({ id }: { id: string }) => {
      const labelMap: Record<string, { name: string }> = {
        "label-1": { name: "Cold Email" },
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
      filingEnabled: false,
      filingPrompt: null,
      filingConfirmationSendEmail: true,
      draftReplyConfidence: DraftReplyConfidence.ALL_EMAILS,
    };
  }

  it("should skip if message is already being processed", async () => {
    vi.mocked(markMessageAsProcessing).mockResolvedValueOnce(false);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };

    await processHistoryItem(createHistoryItem(), options, logger);
  });

  it("handles outbound message-added events", async () => {
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
    await processHistoryItem(createHistoryItem(), options, logger);

    expect(handleOutboundMessage).toHaveBeenCalledWith({
      emailAccount: options.emailAccount,
      message: expect.objectContaining({ id: "123" }),
      provider: mockProvider,
      logger: expect.anything(),
    });
  });

  it("handles SENT label-added events as outbound messages", async () => {
    const sentMessage = {
      id: "sent-123",
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
    };
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(sentMessage),
      blockUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
      isSentMessage: vi.fn().mockReturnValue(true),
    };

    vi.mocked(createEmailProvider).mockResolvedValueOnce(mockProvider as any);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };

    await processHistoryItem(
      createHistoryItem(
        "sent-123",
        "thread-123",
        HistoryEventType.LABEL_ADDED,
        [GmailLabel.SENT],
      ),
      options,
      logger,
    );

    expect(markMessageAsProcessing).toHaveBeenCalledWith({
      userEmail: options.emailAccount.email,
      messageId: "sent-123",
    });
    expect(handleOutboundMessage).toHaveBeenCalledWith({
      emailAccount: options.emailAccount,
      message: sentMessage,
      provider: mockProvider,
      logger: expect.anything(),
    });
  });

  it("should skip if email is unsubscribed", async () => {
    const mockPrisma = await import("@/utils/prisma");
    vi.mocked(mockPrisma.default.newsletter.findFirst).mockResolvedValueOnce({
      id: "newsletter-123",
      email: "sender@example.com",
      name: null,
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
    await processHistoryItem(createHistoryItem(), options, logger);

    expect(mockProvider.blockUnsubscribedEmail).toHaveBeenCalledWith("123");
  });
});
