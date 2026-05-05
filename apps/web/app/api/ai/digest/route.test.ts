vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockAiSummarizeEmailForDigest,
  mockCheckHasAccess,
  mockGetEmailAccountWithAi,
  mockReserveDigestSummarySlot,
} = vi.hoisted(() => ({
  mockAiSummarizeEmailForDigest: vi.fn(),
  mockCheckHasAccess: vi.fn(),
  mockGetEmailAccountWithAi: vi.fn(),
  mockReserveDigestSummarySlot: vi.fn(),
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    DIGEST_MAX_SUMMARIES_PER_24H: 50,
    RESEND_FROM_EMAIL: "digest@example.com",
  },
}));

vi.mock("@/utils/middleware", () => ({
  withError:
    (
      _scope: string,
      handler: (
        request: NextRequest & {
          logger: ReturnType<typeof createScopedLogger>;
        },
      ) => Promise<Response>,
    ) =>
    async (request: NextRequest) => {
      const requestWithLogger = request as NextRequest & {
        logger: ReturnType<typeof createScopedLogger>;
      };
      requestWithLogger.logger = createScopedLogger("test/digest-route");
      return handler(requestWithLogger);
    },
}));

vi.mock("@/utils/qstash", () => ({
  withQstashOrInternal: (handler: unknown) => handler,
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: mockGetEmailAccountWithAi,
}));

vi.mock("@/utils/premium/server", () => ({
  checkHasAccess: mockCheckHasAccess,
}));

vi.mock("@/utils/digest/summary-limit", () => ({
  reserveDigestSummarySlot: mockReserveDigestSummarySlot,
  releaseDigestSummarySlot: vi.fn(),
}));

vi.mock("@/utils/ai/digest/summarize-email-for-digest", () => ({
  aiSummarizeEmailForDigest: mockAiSummarizeEmailForDigest,
}));

import { POST } from "./route";

describe("digest route action ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEmailAccountWithAi.mockResolvedValue(
      getEmailAccount({ id: "account-a", userId: "user-a" }),
    );
    mockCheckHasAccess.mockResolvedValue(true);
    mockReserveDigestSummarySlot.mockResolvedValue({
      reserved: true,
      reservationId: null,
      reservationSource: null,
    });
    mockAiSummarizeEmailForDigest.mockResolvedValue({
      title: "Summary",
      summary: "Summarized",
    });
  });

  it("does not use a rule name from an executed action owned by another email account", async () => {
    prisma.executedAction.findFirst.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/ai/digest", {
        method: "POST",
        body: JSON.stringify({
          emailAccountId: "account-a",
          actionId: "foreign-action-id",
          message: {
            id: "message-1",
            threadId: "thread-1",
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Important update",
            content: "Please summarize this.",
          },
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(prisma.executedAction.findFirst).toHaveBeenCalledWith({
      where: {
        id: "foreign-action-id",
        executedRule: {
          emailAccountId: "account-a",
        },
      },
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
    });
    expect(mockAiSummarizeEmailForDigest).not.toHaveBeenCalled();
    expect(mockReserveDigestSummarySlot).not.toHaveBeenCalled();
  });
});
