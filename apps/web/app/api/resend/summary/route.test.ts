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
import { env } from "@/env";

vi.mock("@/utils/prisma");
const settings = vi.hoisted(() => ({ mailAppEnabled: true }));

vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: {
      ...env,
      get NEXT_PUBLIC_MAIL_APP_ENABLED() {
        return settings.mailAppEnabled;
      },
    },
  };
});

const {
  mockCreateEmailProvider,
  mockCreateUnsubscribeToken,
  mockIsAuthorizedCronOrInternalRequest,
  mockSendSummaryEmail,
} = vi.hoisted(() => ({
  mockCreateEmailProvider: vi.fn(),
  mockCreateUnsubscribeToken: vi.fn(),
  mockIsAuthorizedCronOrInternalRequest: vi.fn(),
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
  isAuthorizedCronOrInternalRequest: (...args: unknown[]) =>
    mockIsAuthorizedCronOrInternalRequest(...args),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: (...args: unknown[]) =>
    mockCreateUnsubscribeToken(...args),
}));

vi.mock("@inboxzero/transactional-email", () => ({
  sendSummaryEmail: (...args: unknown[]) => mockSendSummaryEmail(...args),
}));

import { POST } from "./route";

describe("summary email route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings.mailAppEnabled = true;
    mockIsAuthorizedCronOrInternalRequest.mockReturnValue(true);
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
    // Immediate archives, then delayed archives.
    prisma.executedAction.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prisma.executedAction.findMany
      .mockResolvedValueOnce([
        {
          id: "archive-action-1",
          createdAt: archivedAt,
          executedRule: {
            messageId: "archived-message-1",
            rule: { name: "Marketing", systemType: SystemType.MARKETING },
          },
        },
      ])
      .mockResolvedValueOnce([
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
    expect(mockIsAuthorizedCronOrInternalRequest).toHaveBeenCalledWith(
      expect.any(Request),
    );
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
        emailAccountId: "email-account-id",
        archivedEmails: [
          {
            from: "Marketing <marketing@example.com>",
            subject: "Product update",
            sentAt: archivedAt,
            ruleName: "Marketing",
            url: new URL(
              "/email-account-id/mail?thread-id=thread-archived-message-1",
              env.NEXT_PUBLIC_BASE_URL,
            ).href,
            senderUrl: new URL(
              "/email-account-id/mail?q=from%3Amarketing%40example.com",
              env.NEXT_PUBLIC_BASE_URL,
            ).href,
          },
          {
            from: "Newsletter <newsletter@example.com>",
            subject: "Newsletter snippet",
            sentAt: archivedAt,
            ruleName: "Newsletter",
            url: new URL(
              "/email-account-id/mail?thread-id=thread-archived-message-2",
              env.NEXT_PUBLIC_BASE_URL,
            ).href,
            senderUrl: new URL(
              "/email-account-id/mail?q=from%3Anewsletter%40example.com",
              env.NEXT_PUBLIC_BASE_URL,
            ).href,
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

  it.each([
    { name: "one weekly cron interval ago", hoursAgo: 168, expectSend: true },
    { name: "a day ago", hoursAgo: 24, expectSend: false },
  ])("applies the weekly recency gate when the last summary was sent $name", async ({
    hoursAgo,
    expectSend,
  }) => {
    prisma.emailAccount.findUnique
      .mockResolvedValueOnce({
        lastSummaryEmailAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        email: "user@example.com",
        account: { provider: "google", refresh_token: "refresh-token" },
      });
    prisma.rule.findUnique.mockResolvedValue(null);
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
    if (expectSend) {
      expect(prisma.emailAccount.update).toHaveBeenCalled();
    } else {
      expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    }
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
    prisma.executedAction.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    prisma.executedAction.findMany
      .mockResolvedValueOnce([
        {
          id: "archive-action-1",
          createdAt: archivedAt,
          executedRule: {
            messageId: "archived-message-1",
            rule: { name: "Marketing", systemType: SystemType.MARKETING },
          },
        },
      ])
      .mockResolvedValueOnce([]);
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

  it.each([
    true,
    false,
  ])("reports the full cold email count and links to available mail (app enabled: %s)", async (mailAppEnabled) => {
    settings.mailAppEnabled = mailAppEnabled;
    const blockedAt = new Date("2026-06-28T12:00:00.000Z");
    const getMessagesBatch = vi.fn().mockResolvedValue([
      getMessage({
        id: "cold-message-1",
        from: "Sales <sales@example.com>",
        subject: "Quick question",
        snippet: "Quick question snippet",
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
    prisma.rule.findUnique.mockResolvedValue({
      id: "cold-rule-id",
      groupId: "flagged-senders",
    });
    prisma.groupItem.findMany.mockResolvedValue([
      {
        id: "flagged-sales-sender",
        value: "sales@example.com",
        groupId: "flagged-senders",
        type: "FROM",
        exclude: false,
        createdAt: blockedAt,
        updatedAt: blockedAt,
        reason: null,
        threadId: null,
        messageId: null,
        source: null,
      },
    ]);
    prisma.executedRule.count.mockResolvedValue(250);
    prisma.executedRule.findMany.mockResolvedValue([
      { messageId: "cold-message-1", createdAt: blockedAt },
    ]);
    prisma.executedAction.count.mockResolvedValue(0);
    prisma.executedAction.findMany.mockResolvedValue([]);
    prisma.emailAccount.update.mockResolvedValue({});
    mockCreateEmailProvider.mockResolvedValue({ getMessagesBatch });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/resend/summary", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.executedRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(mockSendSummaryEmail).toHaveBeenCalledWith({
      from: expect.any(String),
      to: "user@example.com",
      emailProps: expect.objectContaining({
        coldEmailCount: 250,
        coldEmailers: [
          expect.objectContaining({
            from: "Sales <sales@example.com>",
            sentAt: blockedAt,
            subject: "Quick question",
            url: mailAppEnabled
              ? new URL(
                  "/email-account-id/mail?thread-id=thread-cold-message-1",
                  env.NEXT_PUBLIC_BASE_URL,
                ).href
              : "https://mail.google.com/mail/u/?authuser=user%40example.com#all/cold-message-1",
            notColdUrl: new URL(
              "/email-account-id/cold-email-blocker?not-cold=flagged-sales-sender",
              env.NEXT_PUBLIC_BASE_URL,
            ).href,
          }),
        ],
      }),
    });
  });

  it("keeps archives when the cold-email execution predates the summary window", async () => {
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
    prisma.rule.findUnique.mockResolvedValue({ id: "cold-rule-id" });
    prisma.executedRule.count.mockResolvedValue(0);
    prisma.executedRule.findMany.mockResolvedValue([]);
    prisma.executedAction.count.mockResolvedValue(0);
    prisma.executedAction.findMany.mockResolvedValue([]);
    prisma.emailAccount.update.mockResolvedValue({});

    await POST(
      new NextRequest("http://localhost:3000/api/resend/summary", {
        method: "POST",
        body: JSON.stringify({ emailAccountId: "email-account-id" }),
      }),
    );

    const coldEmailWhere = prisma.executedRule.count.mock.calls[0]?.[0]?.where;
    expect(coldEmailWhere).toMatchObject({
      ruleId: "cold-rule-id",
      createdAt: { gt: expect.any(Date) },
    });
    const { gt: cutoff } = coldEmailWhere?.createdAt as { gt: Date };
    const archiveFilters = [
      { ruleId: null },
      { ruleId: { not: "cold-rule-id" } },
      { createdAt: { lte: cutoff } },
    ];

    expect(prisma.executedAction.count).toHaveBeenCalledTimes(2);
    expect(prisma.executedAction.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        type: ActionType.ARCHIVE,
        scheduledAction: { is: null },
        executedRule: expect.objectContaining({
          emailAccountId: "email-account-id",
          automated: true,
          status: ExecutedRuleStatus.APPLIED,
          OR: archiveFilters,
        }),
      }),
    });
    expect(prisma.executedAction.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        type: ActionType.ARCHIVE,
        scheduledAction: {
          is: expect.objectContaining({
            emailAccountId: "email-account-id",
            status: ScheduledActionStatus.COMPLETED,
          }),
        },
        executedRule: {
          emailAccountId: "email-account-id",
          automated: true,
          OR: archiveFilters,
        },
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
