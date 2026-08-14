import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GmailLabel } from "@/utils/gmail/label";
import type { ParsedMessage } from "@/utils/types";
import { CleanAction } from "@/generated/prisma/enums";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";

const { cleanerEnv } = vi.hoisted(() => ({
  cleanerEnv: {
    NEXT_PUBLIC_CLEANER_ENABLED: true,
  },
}));

vi.mock("@/env", () => ({
  env: cleanerEnv,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware({ handleSafeErrors: true });
});

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

const mockUpdateThread = vi.fn();
vi.mock("@/utils/redis/clean", () => ({
  saveThread: vi.fn().mockResolvedValue(undefined),
  updateThread: (...args: unknown[]) => mockUpdateThread(...args),
}));

vi.mock("@/utils/qstash", () => ({
  withQstashOrInternal: (handler: unknown) => handler,
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
  isMaybeReceipt: vi
    .fn()
    .mockImplementation((message: ParsedMessage) =>
      message.headers.subject.toLowerCase().includes("payment"),
    ),
}));

vi.mock("@/utils/parse/parseHtml.server", () => ({
  findUnsubscribeLink: vi.fn().mockReturnValue(null),
}));

vi.mock("@/utils/parse/calender-event", () => ({
  getCalendarEventStatus: vi.fn().mockReturnValue({ isEvent: false }),
}));

import { cleanThread } from "./controller";
import { POST } from "./route";

const logger = createTestLogger();

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
    labels: [
      { id: "label-newsletters", name: "Newsletters" },
      { id: "label-finance", name: "Finance" },
    ],
    logger,
  };
}

describe("cleanThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanerEnv.NEXT_PUBLIC_CLEANER_ENABLED = true;

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
    mockAiClean.mockResolvedValue({ archive: true, label: null });
  });

  describe("maybe-receipt should not break loop early", () => {
    it("should skip thread when message 1 is maybe-receipt but message 2 is starred", async () => {
      const messages = [
        getMockMessage({
          id: "msg-1",
          from: "store@example.com",
          to: "user@example.com",
          subject: "Payment confirmation",
          labelIds: [],
        }),
        getMockMessage({
          id: "msg-2",
          from: "user@example.com",
          to: "store@example.com",
          subject: "Re: Payment confirmation",
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
        getMockMessage({
          id: "msg-1",
          from: "store@example.com",
          to: "user@example.com",
          subject: "Payment confirmation",
          labelIds: [],
        }),
        getMockMessage({
          id: "msg-2",
          from: "user@example.com",
          to: "store@example.com",
          subject: "Re: Payment confirmation",
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
        getMockMessage({
          id: "msg-1",
          from: "store@example.com",
          to: "user@example.com",
          subject: "Payment confirmation",
          labelIds: [],
        }),
        getMockMessage({
          id: "msg-2",
          from: "store@example.com",
          to: "user@example.com",
          subject: "Invoice attached",
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
        getMockMessage({
          id: "msg-1",
          from: "store@example.com",
          to: "user@example.com",
          subject: "Payment confirmation",
          labelIds: [],
        }),
        getMockMessage({
          id: "msg-2",
          from: "store@example.com",
          to: "user@example.com",
          subject: "Shipping update",
          labelIds: [],
        }),
      ];

      mockGetThreadMessages.mockResolvedValue(messages);

      await cleanThread(getDefaultParams());

      expect(mockAiClean).toHaveBeenCalled();
    });
  });

  describe("AI-chosen labels", () => {
    function getSingleMessageThread() {
      return [
        getMockMessage({
          id: "msg-1",
          from: "newsletter@example.com",
          to: "user@example.com",
          subject: "Weekly digest",
          labelIds: [],
        }),
      ];
    }

    it("passes labels to aiClean", async () => {
      mockGetThreadMessages.mockResolvedValue(getSingleMessageThread());

      await cleanThread(getDefaultParams());

      expect(mockAiClean).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: [
            { id: "label-newsletters", name: "Newsletters" },
            { id: "label-finance", name: "Finance" },
          ],
        }),
      );
    });

    it("publishes the resolved labelId and saves the label name to redis", async () => {
      mockGetThreadMessages.mockResolvedValue(getSingleMessageThread());
      mockAiClean.mockResolvedValue({ archive: true, label: "Finance" });

      await cleanThread(getDefaultParams());

      expect(mockPublishToQstash).toHaveBeenCalledWith(
        "/api/clean/gmail",
        expect.objectContaining({
          markDone: true,
          labelId: "label-finance",
          labelName: "Finance",
        }),
        expect.any(Object),
      );

      const update = mockUpdateThread.mock.calls[0][0].update;
      expect(update).toMatchObject({ archive: true, label: "Finance" });
    });

    it("persists the canonical label name when the AI returns a non-canonical match", async () => {
      mockGetThreadMessages.mockResolvedValue(getSingleMessageThread());
      mockAiClean.mockResolvedValue({ archive: false, label: "  finance " });

      await cleanThread(getDefaultParams());

      expect(mockPublishToQstash).toHaveBeenCalledWith(
        "/api/clean/gmail",
        expect.objectContaining({
          labelId: "label-finance",
          labelName: "Finance",
        }),
        expect.any(Object),
      );

      const update = mockUpdateThread.mock.calls[0][0].update;
      expect(update.label).toBe("Finance");
    });

    it("prefers an exact label name match over a normalized one", async () => {
      mockGetThreadMessages.mockResolvedValue(getSingleMessageThread());
      mockAiClean.mockResolvedValue({ archive: false, label: "Q1-Report" });

      await cleanThread({
        ...getDefaultParams(),
        labels: [
          { id: "label-q1-space", name: "Q1 Report" },
          { id: "label-q1-dash", name: "Q1-Report" },
        ],
      });

      expect(mockPublishToQstash).toHaveBeenCalledWith(
        "/api/clean/gmail",
        expect.objectContaining({
          labelId: "label-q1-dash",
          labelName: "Q1-Report",
        }),
        expect.any(Object),
      );
    });

    it("rejects ambiguous normalized label matches", async () => {
      mockGetThreadMessages.mockResolvedValue(getSingleMessageThread());
      mockAiClean.mockResolvedValue({ archive: false, label: "q1-report" });

      await cleanThread({
        ...getDefaultParams(),
        labels: [
          { id: "label-q1-space", name: "Q1 Report" },
          { id: "label-q1-dash", name: "Q1-Report" },
        ],
      });

      const cleanGmailBody = mockPublishToQstash.mock.calls[0][1] as {
        labelId?: string;
        labelName?: string;
      };
      expect(cleanGmailBody.labelId).toBeUndefined();
      expect(cleanGmailBody.labelName).toBeUndefined();
    });

    it("omits labelId when the label name doesn't match any provided label", async () => {
      mockGetThreadMessages.mockResolvedValue(getSingleMessageThread());
      mockAiClean.mockResolvedValue({ archive: false, label: "Unknown label" });

      await cleanThread(getDefaultParams());

      const cleanGmailBody = mockPublishToQstash.mock.calls[0][1] as {
        labelId?: string;
        labelName?: string;
      };
      expect(cleanGmailBody.labelId).toBeUndefined();
      expect(cleanGmailBody.labelName).toBeUndefined();

      const update = mockUpdateThread.mock.calls[0][0].update;
      expect(update.label).toBeUndefined();
    });
  });

  it("returns not found when cleaner is disabled on self-hosted", async () => {
    cleanerEnv.NEXT_PUBLIC_CLEANER_ENABLED = false;

    const response = await POST(
      new NextRequest("http://localhost:3000/api/clean", {
        method: "POST",
      }) as any,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Cleaner is not enabled",
      isKnownError: true,
    });
    expect(mockGetThreadMessages).not.toHaveBeenCalled();
  });
});
