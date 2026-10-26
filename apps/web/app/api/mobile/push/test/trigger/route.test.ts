import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePushTokenType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { redis } from "@/utils/redis";

const { transports } = vi.hoisted(() => ({
  transports: {
    APNS_TRANSPORT: "fake" as string | undefined,
    FCM_TRANSPORT: "fake" as string | undefined,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", async (importActual) => {
  const actual = (await importActual<typeof import("@/env")>()).env;
  return {
    env: new Proxy(actual, {
      get: (target, key) =>
        key in transports
          ? transports[key as keyof typeof transports]
          : target[key as keyof typeof target],
    }),
  };
});
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({ redis: { set: vi.fn() } }));
vi.mock("@/utils/redis/local-mail-hints", () => ({
  publishLocalMailHint: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware();
});

import { POST } from "./route";

const fcmToken = `dK3x9Q:APA91b${"Fz_x-9".repeat(24)}`;
const apnsToken = "a".repeat(64);

describe("/api/mobile/push/test/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transports.APNS_TRANSPORT = "fake";
    transports.FCM_TRANSPORT = "fake";
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "account-1",
      account: { provider: "google" },
    } as never);
  });

  it("sends a silent mailbox hint to every native device", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    prisma.emailAccount.findUnique.mockResolvedValue({
      user: {
        mobilePushTokens: [
          { token: apnsToken, tokenType: MobilePushTokenType.APNS },
          { token: fcmToken, tokenType: MobilePushTokenType.FCM },
        ],
      },
    } as never);

    const response = await POST(
      request({ type: "mailbox", emailAccountId: "account-1" }),
      {} as never,
    );

    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-1", userId: "user-1" },
      }),
    );
    expect(response.status).toBe(200);
    const { sends } = await response.json();
    expect(sends).toEqual([
      expect.objectContaining({
        type: "apns",
        token: apnsToken,
        payload: {
          aps: { "content-available": 1 },
          emailAccountId: "account-1",
          hint: "mailbox",
        },
      }),
      expect.objectContaining({
        type: "fcm",
        token: fcmToken,
        message: {
          token: fcmToken,
          data: { emailAccountId: "account-1", hint: "mailbox" },
          android: { priority: "NORMAL" },
        },
      }),
    ]);
  });

  it("sends a To Reply alert for a message, even an old seeded one", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage: vi.fn(async () => ({
        id: "message-1",
        threadId: "thread-1",
        internalDate: String(Date.parse("2026-01-02T03:04:05.000Z")),
        subject: "Quarterly plan",
        headers: {
          from: "Alice Example <alice@example.com>",
          date: "Fri, 02 Jan 2026 03:04:05 +0000",
        },
      })),
    } as never);
    prisma.mobilePushToken.findMany.mockResolvedValue([
      { id: "token-1", token: fcmToken, tokenType: MobilePushTokenType.FCM },
    ] as never);
    prisma.mobilePushDelivery.createManyAndReturn.mockResolvedValue([
      { mobilePushTokenId: "token-1" },
    ] as never);

    const response = await POST(
      request({
        type: "to_reply",
        emailAccountId: "account-1",
        messageId: "message-1",
      }),
      {} as never,
    );

    expect(createEmailProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        provider: "google",
      }),
    );
    expect(prisma.mobilePushDelivery.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            deduplicationKey: "to-reply:account-1:message-1",
            mobilePushTokenId: "token-1",
          },
        ],
      }),
    );
    await expect(response.json()).resolves.toEqual({
      sends: [
        {
          type: "fcm",
          token: fcmToken,
          projectId: expect.any(String),
          message: {
            token: fcmToken,
            notification: { title: "Alice Example", body: "Quarterly plan" },
            data: {
              threadId: "thread-1",
              emailAccountId: "account-1",
              messageId: "message-1",
              type: "to_reply",
            },
            android: {
              priority: "HIGH",
              notification: { channel_id: "mail", sound: "default" },
            },
          },
        },
      ],
    });
  });

  it("does not reach another user's account", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(null);

    const response = await POST(
      request({ type: "mailbox", emailAccountId: "someone-else" }),
      {} as never,
    );

    expect(response.status).toBe(404);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("is not found when the push transports are real", async () => {
    transports.APNS_TRANSPORT = undefined;
    transports.FCM_TRANSPORT = undefined;

    const response = await POST(
      request({ type: "mailbox", emailAccountId: "account-1" }),
      {} as never,
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/mobile/push/test/trigger", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
