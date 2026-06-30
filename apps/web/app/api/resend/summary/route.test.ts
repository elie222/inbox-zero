import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
  SystemType,
} from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";

vi.mock("@/utils/prisma");

const {
  mockCreateEmailProvider,
  mockCreateUnsubscribeToken,
  mockHasCronSecret,
  mockIsValidInternalApiKey,
  mockSendSummaryEmail,
} = vi.hoisted(() => ({
  mockCreateEmailProvider: vi.fn(),
  mockCreateUnsubscribeToken: vi.fn(),
  mockHasCronSecret: vi.fn(),
  mockIsValidInternalApiKey: vi.fn(),
  mockSendSummaryEmail: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const {
    createWithEmailAccountTestMiddleware,
    createWithErrorTestMiddleware,
  } = await vi.importActual<typeof import("@/__tests__/helpers")>(
    "@/__tests__/helpers",
  );

  return {
    ...createWithErrorTestMiddleware(),
    ...createWithEmailAccountTestMiddleware({
      auth: {
        email: "user@example.com",
        emailAccountId: "email-account-id",
        userId: "user-1",
      },
    }),
  };
});

vi.mock("@/utils/cron", () => ({
  hasCronSecret: (...args: unknown[]) => mockHasCronSecret(...args),
}));

vi.mock("@/utils/internal-api", () => ({
  isValidInternalApiKey: (...args: unknown[]) =>
    mockIsValidInternalApiKey(...args),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: (...args: unknown[]) =>
    mockCreateUnsubscribeToken(...args),
}));

vi.mock("@inboxzero/resend", () => ({
  sendSummaryEmail: (...args: unknown[]) => mockSendSummaryEmail(...args),
}));

import { POST } from "./route";

describe("summary email route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasCronSecret.mockReturnValue(true);
    mockIsValidInternalApiKey.mockReturnValue(false);
    mockCreateUnsubscribeToken.mockResolvedValue("unsubscribe-token");
    mockSendSummaryEmail.mockResolvedValue(undefined);
  });

  it("sends a weekly update when automated archive activity is the only reportable item", async () => {
    const archivedAt = new Date("2026-06-28T12:00:00.000Z");
    const getMessagesBatch = vi.fn().mockResolvedValue([
      getMessage({
        id: "archived-message-1",
        from: "Marketing <marketing@example.com>",
        subject: "Product update",
        snippet: "Product update snippet",
      }),
      getMessage({
        id: "archived-message-2",
        from: "Newsletter <newsletter@example.com>",
        subject: "",
        snippet: "Newsletter snippet",
      }),
    ]);

    prisma.emailAccount.findUnique
      .mockResolvedValueOnce({ lastSummaryEmailAt: null })
      .mockResolvedValueOnce({
        userId: "user-1",
        email: "user@example.com",
        account: {
          provider: "google",
          refresh_token: "refresh-token",
        },
      });
    prisma.rule.findUnique.mockResolvedValue(null);
    prisma.threadTracker.groupBy.mockResolvedValue([]);
    prisma.threadTracker.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.executedAction.count.mockResolvedValue(2);
    prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "archive-action-1",
        createdAt: archivedAt,
        executedRule: {
          messageId: "archived-message-1",
          rule: { name: "Marketing", systemType: SystemType.MARKETING },
        },
      },
      {
        id: "archive-action-2",
        createdAt: archivedAt,
        executedRule: {
          messageId: "archived-message-2",
          rule: { name: "Newsletter", systemType: SystemType.NEWSLETTER },
        },
      },
    ]);
    prisma.emailAccount.update.mockResolvedValue({});
    mockCreateEmailProvider.mockResolvedValue({ getMessagesBatch });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/summary", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateEmailProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        provider: "google",
      }),
    );
    expect(getMessagesBatch).toHaveBeenCalledWith([
      "archived-message-1",
      "archived-message-2",
    ]);
    expect(mockSendSummaryEmail).toHaveBeenCalledWith({
      from: expect.any(String),
      to: "user@example.com",
      emailProps: expect.objectContaining({
        archivedEmailCount: 2,
        archivedEmails: [
          {
            from: "Marketing <marketing@example.com>",
            subject: "Product update",
            sentAt: archivedAt,
            ruleName: "Marketing",
          },
          {
            from: "Newsletter <newsletter@example.com>",
            subject: "Newsletter snippet",
            sentAt: archivedAt,
            ruleName: "Newsletter",
          },
        ],
        coldEmailers: [],
        unsubscribeToken: "unsubscribe-token",
      }),
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-id" },
      data: { lastSummaryEmailAt: expect.any(Date) },
    });
  });

  it("does not send when there is no weekly summary activity", async () => {
    prisma.emailAccount.findUnique
      .mockResolvedValueOnce({ lastSummaryEmailAt: null })
      .mockResolvedValueOnce({
        userId: "user-1",
        email: "user@example.com",
        account: {
          provider: "google",
          refresh_token: "refresh-token",
        },
      });
    prisma.rule.findUnique.mockResolvedValue(null);
    prisma.threadTracker.groupBy.mockResolvedValue([]);
    prisma.threadTracker.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.executedAction.count.mockResolvedValue(0);
    prisma.executedAction.findMany.mockResolvedValue([]);
    prisma.emailAccount.update.mockResolvedValue({});

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/summary", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSendSummaryEmail).not.toHaveBeenCalled();
    expect(prisma.emailAccount.update).toHaveBeenCalled();
  });

  it("sends archive counts without fetching messages for unsupported providers", async () => {
    const archivedAt = new Date("2026-06-28T12:00:00.000Z");

    prisma.emailAccount.findUnique
      .mockResolvedValueOnce({ lastSummaryEmailAt: null })
      .mockResolvedValueOnce({
        userId: "user-1",
        email: "user@example.com",
        account: {
          provider: "unsupported",
          refresh_token: "refresh-token",
        },
      });
    prisma.rule.findUnique.mockResolvedValue(null);
    prisma.threadTracker.groupBy.mockResolvedValue([]);
    prisma.threadTracker.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.executedAction.count.mockResolvedValue(1);
    prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "archive-action-1",
        createdAt: archivedAt,
        executedRule: {
          messageId: "archived-message-1",
          rule: { name: "Marketing", systemType: SystemType.MARKETING },
        },
      },
    ]);
    prisma.emailAccount.update.mockResolvedValue({});

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/summary", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
    expect(mockSendSummaryEmail).toHaveBeenCalledWith({
      from: expect.any(String),
      to: "user@example.com",
      emailProps: expect.objectContaining({
        archivedEmailCount: 1,
        archivedEmails: [],
      }),
    });
  });

  it("counts only completed archive actions in the weekly archive summary query", async () => {
    prisma.emailAccount.findUnique
      .mockResolvedValueOnce({ lastSummaryEmailAt: null })
      .mockResolvedValueOnce({
        userId: "user-1",
        email: "user@example.com",
        account: {
          provider: "google",
          refresh_token: "refresh-token",
        },
      });
    prisma.rule.findUnique.mockResolvedValue(null);
    prisma.threadTracker.groupBy.mockResolvedValue([]);
    prisma.threadTracker.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.executedAction.count.mockResolvedValue(0);
    prisma.executedAction.findMany.mockResolvedValue([]);
    prisma.emailAccount.update.mockResolvedValue({});

    await POST(
      new NextRequest("http://localhost:3000/api/resend/summary", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(prisma.executedAction.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        type: ActionType.ARCHIVE,
        executedRule: expect.objectContaining({
          emailAccountId: "email-account-id",
          automated: true,
        }),
        OR: [
          {
            scheduledAction: {
              is: { status: ScheduledActionStatus.COMPLETED },
            },
          },
          {
            scheduledAction: { is: null },
            executedRule: { status: ExecutedRuleStatus.APPLIED },
          },
        ],
      }),
    });
  });
});

function getMessage({
  id,
  from,
  subject,
  snippet,
}: {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}): ParsedMessage {
  return {
    date: "2026-06-28T12:00:00.000Z",
    headers: {
      date: "2026-06-28T12:00:00.000Z",
      from,
      subject,
      to: "user@example.com",
    },
    historyId: "history-id",
    id,
    inline: [],
    snippet,
    subject,
    threadId: `thread-${id}`,
  };
}
