import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import type { ParsedMessage } from "@/utils/types";
import { sendOtpPushNotification } from "./mobile-push";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

describe("sendOtpPushNotification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends an expiring notification to every registered device", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      {
        token: "ExponentPushToken[first]",
      },
      {
        token: "ExponentPushToken[second]",
      },
    ] as never);
    prisma.otpPushNotification.create.mockResolvedValue({} as never);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ status: "ok" }, { status: "ok" }],
        }),
        { status: 200 },
      ),
    );

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({
        id: "message-1",
        threadId: "thread-1",
        subject: "Your verification code is 123456",
      }),
      logger,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[first]",
        title: "Verification code",
        ttl: 900,
        data: {
          type: "otp",
          url: "/thread/thread-1?accountId=account-1",
        },
      }),
      expect.objectContaining({
        to: "ExponentPushToken[second]",
      }),
    ]);
  });

  it("does not notify for a security alert without an OTP", async () => {
    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Suspicious login attempt" }),
      logger,
    });

    expect(prisma.mobilePushToken.findMany).not.toHaveBeenCalled();
  });

  it("deduplicates repeated webhook delivery", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { token: "ExponentPushToken[first]" },
    ] as never);
    prisma.otpPushNotification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["emailAccountId", "messageId"] },
      }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Your login code is 123456" }),
      logger,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function message(overrides: Partial<ParsedMessage>): ParsedMessage {
  const subject = overrides.subject ?? "Your verification code";
  return {
    date: "2026-07-31T12:00:00.000Z",
    headers: {
      date: "2026-07-31T12:00:00.000Z",
      from: "Security <security@example.com>",
      subject,
      to: "user@example.com",
    },
    historyId: "history-1",
    id: "message-1",
    inline: [],
    snippet: subject,
    subject,
    threadId: "thread-1",
    ...overrides,
  };
}
