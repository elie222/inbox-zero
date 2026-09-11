import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";

const { mockEmailProvider, mockLogger } = vi.hoisted(() => ({
  mockEmailProvider: {
    getMessagesBatch: vi.fn(),
  },
  mockLogger: {
    error: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (_name: string, handler: (request: any) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: {
            emailAccountId: "email-account-1",
            userId: "user-1",
          },
          emailProvider: mockEmailProvider,
          logger: mockLogger,
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/user/onboarding/processed-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns processed emails sorted by message date with draft counts", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      createExecutedRule({
        messageId: "older-message",
        threadId: "thread-older",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        rule: {
          name: "Receipts",
          systemType: "TO_REPLY",
        },
        actionItems: [{ type: ActionType.LABEL }],
      }),
      createExecutedRule({
        messageId: "newer-message",
        threadId: "thread-newer",
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
        rule: {
          name: "Needs reply",
          systemType: "NEEDS_REPLY",
        },
        actionItems: [{ type: ActionType.DRAFT_EMAIL }],
      }),
    ] as any);
    mockEmailProvider.getMessagesBatch.mockResolvedValue([
      createMessage({
        id: "older-message",
        from: "Billing Team <billing@example.com>",
        subject: "April receipt",
        internalDate: "1777593600000",
      }),
      createMessage({
        id: "newer-message",
        from: "Support <support@example.com>",
        subject: "Question about renewal",
        internalDate: "1777680000000",
      }),
    ]);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(prisma.executedRule.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        status: ExecutedRuleStatus.APPLIED,
        rule: { isNot: null },
      },
      orderBy: { createdAt: "desc" },
      take: ONBOARDING_PROCESS_EMAILS_COUNT,
      distinct: ["threadId"],
      select: {
        messageId: true,
        threadId: true,
        createdAt: true,
        rule: {
          select: {
            name: true,
            systemType: true,
          },
        },
        actionItems: {
          select: { type: true },
        },
      },
    });
    expect(mockEmailProvider.getMessagesBatch).toHaveBeenCalledWith([
      "older-message",
      "newer-message",
    ]);
    expect(body).toEqual({
      totalCount: 2,
      draftCount: 1,
      emails: [
        {
          messageId: "newer-message",
          systemType: "NEEDS_REPLY",
          label: "Needs reply",
          sender: "Support",
          subject: "Question about renewal",
          date: "1777680000000",
          hasDraft: true,
        },
        {
          messageId: "older-message",
          systemType: "TO_REPLY",
          label: "Receipts",
          sender: "Billing Team",
          subject: "April receipt",
          date: "1777593600000",
          hasDraft: false,
        },
      ],
    });
  });

  it("omits rows whose provider messages are missing from the batch", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      createExecutedRule({ messageId: "message-1" }),
      createExecutedRule({ messageId: "missing-message" }),
    ] as any);
    mockEmailProvider.getMessagesBatch.mockResolvedValue([
      createMessage({ id: "message-1", subject: "Fetched message" }),
    ]);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toMatchObject({
      totalCount: 1,
      draftCount: 0,
      emails: [
        {
          messageId: "message-1",
          subject: "Fetched message",
        },
      ],
    });
  });

  it("does not fail onboarding when provider preview fetching fails", async () => {
    const error = new Error("provider unavailable");
    prisma.executedRule.findMany.mockResolvedValue([
      createExecutedRule({ messageId: "message-1" }),
    ] as any);
    mockEmailProvider.getMessagesBatch.mockRejectedValue(error);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body).toEqual({
      totalCount: 0,
      draftCount: 0,
      emails: [],
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to fetch messages for onboarding preview",
      { error },
    );
  });
});

function createRequest() {
  return new NextRequest(
    "http://localhost:3000/api/user/onboarding/processed-emails",
  );
}

function createExecutedRule({
  messageId = "message-1",
  threadId = "thread-1",
  createdAt = new Date("2026-05-01T00:00:00.000Z"),
  rule = {
    name: "Labeled",
    systemType: null,
  },
  actionItems = [],
}: {
  messageId?: string;
  threadId?: string;
  createdAt?: Date;
  rule?: {
    name: string;
    systemType: string | null;
  } | null;
  actionItems?: { type: ActionType }[];
}) {
  return {
    messageId,
    threadId,
    createdAt,
    rule,
    actionItems,
  };
}

function createMessage({
  id,
  from = "Sender <sender@example.com>",
  subject = "Subject",
  internalDate = "1777593600000",
}: {
  id: string;
  from?: string;
  subject?: string;
  internalDate?: string;
}) {
  return {
    id,
    headers: {
      from,
      subject,
    },
    internalDate,
  };
}
