import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanThread } from "./route";
import { GmailLabel } from "@/utils/gmail/label";
import type { ParsedMessage } from "@/utils/types";
import { CleanAction } from "@/generated/prisma/enums";

vi.mock("server-only", () => ({}));

const mockPublishToQstash = vi.fn();
vi.mock("@/utils/upstash", () => ({
  publishToQstash: (...args: unknown[]) => mockPublishToQstash(...args),
}));

const mockGetThreadMessages = vi.fn();
vi.mock("@/utils/gmail/thread", () => ({
  getThreadMessages: (...args: unknown[]) => mockGetThreadMessages(...args),
}));

vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: vi.fn().mockResolvedValue({}),
}));

const mockGetEmailAccountWithAiAndTokens = vi.fn();
const mockGetUserPremium = vi.fn();
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: (...args: unknown[]) =>
    mockGetEmailAccountWithAiAndTokens(...args),
  getUserPremium: (...args: unknown[]) => mockGetUserPremium(...args),
}));

vi.mock("@/utils/redis/clean", () => ({
  saveThread: vi.fn().mockResolvedValue(undefined),
  updateThread: vi.fn().mockResolvedValue(undefined),
}));

const mockAiClean = vi.fn();
vi.mock("@/utils/ai/clean/ai-clean", () => ({
  aiClean: (...args: unknown[]) => mockAiClean(...args),
}));

vi.mock("@/utils/ai/group/find-newsletters", () => ({
  isNewsletterSender: vi.fn().mockReturnValue(false),
}));

vi.mock("@/utils/ai/group/find-receipts", () => ({
  isReceipt: vi.fn().mockReturnValue(false),
  isMaybeReceipt: vi.fn().mockImplementation((message: ParsedMessage) => {
    return message.headers.subject.toLowerCase().includes("payment");
  }),
}));

vi.mock("@/utils/parse/parseHtml.server", () => ({
  findUnsubscribeLink: vi.fn().mockReturnValue(null),
}));

vi.mock("@/utils/parse/calender-event", () => ({
  getCalendarEventStatus: vi.fn().mockReturnValue({ isEvent: false }),
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
};

function createMockMessage(
  overrides: Partial<ParsedMessage> & { labelIds?: string[] } = {},
): ParsedMessage {
  return {
    id: overrides.id || "msg-1",
    threadId: "thread-1",
    historyId: "12345",
    snippet: "Test snippet",
    subject: overrides.headers?.subject || "Test Subject",
    date: new Date().toISOString(),
    internalDate: String(Date.now()),
    inline: [],
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Test Subject",
      date: new Date().toISOString(),
      ...overrides.headers,
    },
    labelIds: overrides.labelIds || [],
    attachments: overrides.attachments || [],
    ...overrides,
  };
}

function getDefaultParams() {
  return {
    emailAccountId: "email-account-id",
    threadId: "thread-1",
    markedDoneLabelId: "marked-done-label",
    processedLabelId: "processed-label",
    jobId: "job-1",
    action: CleanAction.ARCHIVE,
    skips: {
      reply: true,
      starred: true,
      calendar: true,
      receipt: true,
      attachment: true,
      conversation: true,
    },
    logger: mockLogger as any,
  };
}

describe("cleanThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEmailAccountWithAiAndTokens.mockResolvedValue({
      id: "email-account-id",
      userId: "user-1",
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: new Date(Date.now() + 3_600_000),
      },
    });

    mockGetUserPremium.mockResolvedValue({
      tier: "pro",
      lemonSqueezyRenewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    mockPublishToQstash.mockResolvedValue(undefined);
    mockAiClean.mockResolvedValue({ archive: true });
  });

  describe("maybe-receipt should not break loop early", () => {
    it("should skip thread when message 1 is maybe-receipt but message 2 is starred", async () => {
      const messages = [
        createMockMessage({
          id: "msg-1",
          headers: {
            from: "store@example.com",
            to: "user@example.com",
            subject: "Payment confirmation",
            date: new Date().toISOString(),
          },
          labelIds: [],
        }),
        createMockMessage({
          id: "msg-2",
          headers: {
            from: "user@example.com",
            to: "store@example.com",
            subject: "Re: Payment confirmation",
            date: new Date().toISOString(),
          },
          labelIds: [GmailLabel.STARRED],
        }),
      ];

      mockGetThreadMessages.mockResolvedValue(messages);

      await cleanThread(getDefaultParams());

      expect(mockPublishToQstash).toHaveBeenCalledWith(
        "/api/clean/gmail",
        expect.objectContaining({ markDone: false }),
        expect.any(Object),
      );
      expect(mockAiClean).not.toHaveBeenCalled();
    });

    it("should skip thread when message 1 is maybe-receipt but message 2 is user's reply (conversation)", async () => {
      const messages = [
        createMockMessage({
          id: "msg-1",
          headers: {
            from: "store@example.com",
            to: "user@example.com",
            subject: "Payment confirmation",
            date: new Date().toISOString(),
          },
          labelIds: [],
        }),
        createMockMessage({
          id: "msg-2",
          headers: {
            from: "user@example.com",
            to: "store@example.com",
            subject: "Re: Payment confirmation",
            date: new Date().toISOString(),
          },
          labelIds: [GmailLabel.SENT],
        }),
      ];

      mockGetThreadMessages.mockResolvedValue(messages);

      await cleanThread(getDefaultParams());

      expect(mockPublishToQstash).toHaveBeenCalledWith(
        "/api/clean/gmail",
        expect.objectContaining({ markDone: false }),
        expect.any(Object),
      );
      expect(mockAiClean).not.toHaveBeenCalled();
    });

    it("should skip thread when message 1 is maybe-receipt but message 2 has attachments", async () => {
      const messages = [
        createMockMessage({
          id: "msg-1",
          headers: {
            from: "store@example.com",
            to: "user@example.com",
            subject: "Payment confirmation",
            date: new Date().toISOString(),
          },
          labelIds: [],
        }),
        createMockMessage({
          id: "msg-2",
          headers: {
            from: "store@example.com",
            to: "user@example.com",
            subject: "Invoice attached",
            date: new Date().toISOString(),
          },
          labelIds: [],
          attachments: [
            {
              filename: "invoice.pdf",
              mimeType: "application/pdf",
              size: 1024,
              attachmentId: "att-1",
              headers: {
                "content-type": "application/pdf",
                "content-description": "Invoice",
                "content-transfer-encoding": "base64",
                "content-id": "att-1",
              },
            },
          ],
        }),
      ];

      mockGetThreadMessages.mockResolvedValue(messages);

      await cleanThread(getDefaultParams());

      expect(mockPublishToQstash).toHaveBeenCalledWith(
        "/api/clean/gmail",
        expect.objectContaining({ markDone: false }),
        expect.any(Object),
      );
      expect(mockAiClean).not.toHaveBeenCalled();
    });

    it("should call LLM when maybe-receipt found and no skip conditions in other messages", async () => {
      const messages = [
        createMockMessage({
          id: "msg-1",
          headers: {
            from: "store@example.com",
            to: "user@example.com",
            subject: "Payment confirmation",
            date: new Date().toISOString(),
          },
          labelIds: [],
        }),
        createMockMessage({
          id: "msg-2",
          headers: {
            from: "store@example.com",
            to: "user@example.com",
            subject: "Shipping update",
            date: new Date().toISOString(),
          },
          labelIds: [],
        }),
      ];

      mockGetThreadMessages.mockResolvedValue(messages);

      await cleanThread(getDefaultParams());

      expect(mockAiClean).toHaveBeenCalled();
    });
  });
});
