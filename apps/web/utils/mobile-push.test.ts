import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import type { ParsedMessage } from "@/utils/types";
import { sendOtpPushNotification } from "./mobile-push";

vi.mock("@/utils/prisma");

const logger = createTestLogger();
const now = new Date("2026-07-31T12:05:00.000Z");

describe("sendOtpPushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("sends an expiring notification to every registered device", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      {
        id: "token-1",
        token: "ExponentPushToken[first]",
      },
      {
        id: "token-2",
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
      now,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[first]",
        title: "Verification code",
        expiration: new Date("2026-07-31T12:15:00.000Z").getTime() / 1000,
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
      now,
    });

    expect(prisma.mobilePushToken.findMany).not.toHaveBeenCalled();
  });

  it("deduplicates repeated webhook delivery", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { id: "token-1", token: "ExponentPushToken[first]" },
    ] as never);
    prisma.otpPushNotification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: {
          target: ["emailAccountId", "messageId", "mobilePushTokenId"],
        },
      }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Your login code is 123456" }),
      logger,
      now,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not notify for an OTP older than 15 minutes", async () => {
    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({
        date: "2026-07-31T11:49:59.999Z",
        subject: "Your login code is 123456",
      }),
      logger,
      now,
    });

    expect(prisma.mobilePushToken.findMany).not.toHaveBeenCalled();
  });

  it("sends at most 100 notifications in each Expo request", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: `token-${index}`,
        token: `ExponentPushToken[token-${index}]`,
      })) as never,
    );
    prisma.otpPushNotification.create.mockResolvedValue({} as never);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const notificationCount = JSON.parse(String(init?.body)).length;
        return new Response(
          JSON.stringify({
            data: Array.from({ length: notificationCount }, () => ({
              status: "ok",
            })),
          }),
          { status: 200 },
        );
      });

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Your login code is 123456" }),
      logger,
      now,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(String(init?.body)).length,
      ),
    ).toEqual([100, 1]);
  });

  it("removes unregistered tokens and retries only rejected devices", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { id: "successful", token: "ExponentPushToken[successful]" },
      { id: "unregistered", token: "ExponentPushToken[unregistered]" },
      { id: "retryable", token: "ExponentPushToken[retryable]" },
    ] as never);
    prisma.otpPushNotification.create.mockResolvedValue({} as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok" },
            {
              status: "error",
              details: { error: "DeviceNotRegistered" },
            },
            {
              status: "error",
              details: { error: "MessageRateExceeded" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Your login code is 123456" }),
      logger,
      now,
    });

    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["unregistered"] } },
    });
    expect(prisma.otpPushNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        messageId: "message-1",
        mobilePushTokenId: { in: ["retryable"] },
      },
    });
  });

  it("keeps claims when Expo may have accepted the request", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { id: "token-1", token: "ExponentPushToken[first]" },
    ] as never);
    prisma.otpPushNotification.create.mockResolvedValue({} as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Your login code is 123456" }),
      logger,
      now,
    });

    expect(prisma.otpPushNotification.deleteMany).not.toHaveBeenCalled();
  });

  it("releases claims after a retryable Expo request failure", async () => {
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { id: "token-1", token: "ExponentPushToken[first]" },
    ] as never);
    prisma.otpPushNotification.create.mockResolvedValue({} as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await sendOtpPushNotification({
      emailAccountId: "account-1",
      userId: "user-1",
      message: message({ subject: "Your login code is 123456" }),
      logger,
      now,
    });

    expect(prisma.otpPushNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        messageId: "message-1",
        mobilePushTokenId: { in: ["token-1"] },
      },
    });
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
