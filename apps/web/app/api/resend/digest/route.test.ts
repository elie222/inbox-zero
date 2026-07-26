vi.mock("server-only", () => ({}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DigestStatus } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockCreateEmailProvider,
  mockCreateUnsubscribeToken,
  mockSendDigest,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockCreateEmailProvider: vi.fn(),
  mockCreateUnsubscribeToken: vi.fn(),
  mockSendDigest: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
      handler: (
        request: Request & {
          auth: { emailAccountId: string };
          logger: ReturnType<typeof createScopedLogger>;
        },
      ) => Promise<Response>,
    ) =>
    (request: Request) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1" },
          logger: createScopedLogger("test/resend-digest"),
        }),
      ),
  withError:
    (_scope: string, handler: (request: Request) => Promise<Response>) =>
    (request: Request) =>
      handler(request),
}));

vi.mock("@/utils/qstash", () => ({
  withQstashOrInternal:
    (
      handler: (
        request: Request & { logger: ReturnType<typeof createScopedLogger> },
      ) => Promise<Response>,
    ) =>
    (request: Request) =>
      handler(
        Object.assign(request, {
          logger: createScopedLogger("test/resend-digest"),
        }),
      ),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateEmailProvider,
}));

vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: mockCreateUnsubscribeToken,
}));

vi.mock("@/utils/digest/send-digest", () => ({
  sendDigest: mockSendDigest,
}));

vi.mock("@/utils/error", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error")>();
  return {
    ...actual,
    captureException: mockCaptureException,
  };
});

import { POST } from "./route";

describe("resend digest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { provider: "google", refresh_token: "refresh-token" },
    } as any);
    prisma.schedule.findUnique.mockResolvedValue({
      id: "schedule-1",
      intervalDays: 1,
      occurrences: null,
      daysOfWeek: null,
      timeOfDay: null,
      lastOccurrenceAt: null,
      nextOccurrenceAt: new Date("2026-05-05T08:00:00Z"),
    } as any);
    prisma.digest.findMany.mockResolvedValue([]);
    prisma.digest.updateMany.mockResolvedValue({ count: 0 });
    prisma.digest.updateManyAndReturn.mockResolvedValue([]);
    prisma.schedule.update.mockResolvedValue({} as any);
    prisma.digestItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([]);
    mockCreateEmailProvider.mockResolvedValue({
      getMessagesBatch: vi.fn().mockResolvedValue([
        {
          id: "message-1",
          headers: { from: "Sender <sender@example.com>", subject: "Hello" },
        },
      ]),
    });
    mockCreateUnsubscribeToken.mockResolvedValue("unsubscribe-token");
    mockSendDigest.mockResolvedValue(undefined);
  });

  it("does not send when another worker claimed the pending digests first", async () => {
    prisma.digest.findMany.mockResolvedValue([
      {
        id: "digest-1",
        items: [
          {
            messageId: "message-1",
            content: JSON.stringify({ content: "Digest item" }),
            action: null,
          },
        ],
      },
    ] as any);
    prisma.digest.updateManyAndReturn.mockResolvedValue([]);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "No digests to process",
    });
    expect(prisma.digest.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        status: DigestStatus.PENDING,
      },
      data: {
        status: DigestStatus.PROCESSING,
      },
      select: {
        id: true,
        items: {
          select: {
            messageId: true,
            content: true,
            action: {
              select: {
                executedRule: {
                  select: {
                    rule: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
    expect(mockSendDigest).not.toHaveBeenCalled();
    expect(prisma.digest.updateMany).not.toHaveBeenCalledWith({
      where: {
        id: {
          in: ["digest-1"],
        },
      },
      data: {
        status: DigestStatus.PROCESSING,
      },
    });
  });
});

function createRequest() {
  return new Request("http://localhost/api/resend/digest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ emailAccountId: "email-account-1" }),
  });
}
