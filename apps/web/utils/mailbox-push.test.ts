import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePushTokenType } from "@/generated/prisma/enums";
import { deliverApnsNotifications } from "@/utils/apns";
import { deliverFcmNotifications } from "@/utils/fcm";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";
import { publishLocalMailHint } from "@/utils/redis/local-mail-hints";
import { redis } from "@/utils/redis";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    APNS_TRANSPORT: undefined as string | undefined,
    APNS_KEY_ID: undefined as string | undefined,
    APNS_TEAM_ID: undefined as string | undefined,
    APNS_PRIVATE_KEY: undefined as string | undefined,
    APNS_TOPIC: undefined as string | undefined,
    FCM_TRANSPORT: undefined as string | undefined,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({
  redis: { set: vi.fn() },
}));
vi.mock("@/utils/redis/local-mail-hints", () => ({
  publishLocalMailHint: vi.fn(),
}));
vi.mock("@/utils/apns", () => ({
  deliverApnsNotifications: vi.fn(async () => ({
    unregisteredTokens: [],
    retryTokens: [],
  })),
  isApnsConfigured: () =>
    envMock.APNS_TRANSPORT === "fake" ||
    Boolean(envMock.APNS_KEY_ID && envMock.APNS_PRIVATE_KEY),
}));
vi.mock("@/utils/fcm", () => ({
  deliverFcmNotifications: vi.fn(async () => ({
    unregisteredTokens: [],
    retryTokens: [],
  })),
  isFcmConfigured: () => envMock.FCM_TRANSPORT === "fake",
}));

import { notifyMailboxChanged } from "./mailbox-push";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  with: vi.fn(),
} as unknown as Logger;

describe("notifyMailboxChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.APNS_TRANSPORT = undefined;
    envMock.APNS_KEY_ID = "KEYID123";
    envMock.APNS_TEAM_ID = "TEAMID1234";
    envMock.APNS_PRIVATE_KEY = "private-key";
    envMock.APNS_TOPIC = "com.getinboxzero.app";
    envMock.FCM_TRANSPORT = undefined;
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      user: {
        mobilePushTokens: [
          { token: "a".repeat(64), tokenType: MobilePushTokenType.APNS },
          { token: "b".repeat(64), tokenType: MobilePushTokenType.APNS },
        ],
      },
    } as never);
  });

  it("sends one silent push to the user's APNs tokens and wakes desktop", async () => {
    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(publishLocalMailHint).toHaveBeenCalledWith("account-1", logger);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
      where: { id: "account-1" },
      select: {
        user: {
          select: {
            mobilePushTokens: {
              where: { tokenType: { in: [MobilePushTokenType.APNS] } },
              select: { token: true, tokenType: true },
            },
          },
        },
      },
    });
    expect(redis.set).toHaveBeenCalledWith(
      "mailbox-push-cooldown:account-1",
      "1",
      { nx: true, ex: 20 },
    );
    expect(deliverApnsNotifications).toHaveBeenCalledOnce();
    expect(deliverApnsNotifications).toHaveBeenCalledWith({
      tokens: ["a".repeat(64), "b".repeat(64)],
      notification: {
        pushType: "background",
        data: { emailAccountId: "account-1", hint: "mailbox" },
      },
      logger,
    });
  });

  it("coalesces a second push for the same account inside the window", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      user: {
        mobilePushTokens: [
          { token: "a".repeat(64), tokenType: MobilePushTokenType.APNS },
        ],
      },
    } as never);
    vi.mocked(redis.set).mockImplementation(async () => {
      const calls = vi.mocked(redis.set).mock.calls.length;
      return calls === 1 ? "OK" : null;
    });

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });
    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(deliverApnsNotifications).toHaveBeenCalledOnce();
    expect(publishLocalMailHint).toHaveBeenCalledTimes(2);
  });

  it("sends the same silent hint to Android devices over FCM", async () => {
    envMock.FCM_TRANSPORT = "fake";
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      user: {
        mobilePushTokens: [
          { token: "a".repeat(64), tokenType: MobilePushTokenType.APNS },
          { token: "fcm-1", tokenType: MobilePushTokenType.FCM },
        ],
      },
    } as never);
    vi.mocked(deliverFcmNotifications).mockResolvedValueOnce({
      unregisteredTokens: ["fcm-1"],
      retryTokens: [],
    });

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          user: {
            select: {
              mobilePushTokens: {
                where: {
                  tokenType: {
                    in: [MobilePushTokenType.APNS, MobilePushTokenType.FCM],
                  },
                },
                select: { token: true, tokenType: true },
              },
            },
          },
        },
      }),
    );
    expect(deliverApnsNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["a".repeat(64)] }),
    );
    expect(deliverFcmNotifications).toHaveBeenCalledWith({
      tokens: ["fcm-1"],
      notification: {
        pushType: "background",
        data: { emailAccountId: "account-1", hint: "mailbox" },
      },
      logger,
    });
    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ["fcm-1"] } },
    });
  });

  it("sends to Android when only FCM is configured", async () => {
    envMock.APNS_PRIVATE_KEY = undefined;
    envMock.FCM_TRANSPORT = "fake";
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      user: {
        mobilePushTokens: [
          { token: "fcm-1", tokenType: MobilePushTokenType.FCM },
        ],
      },
    } as never);

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(deliverFcmNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["fcm-1"] }),
    );
  });

  it("does not send when APNs credentials are missing", async () => {
    envMock.APNS_PRIVATE_KEY = undefined;

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(redis.set).not.toHaveBeenCalled();
    expect(deliverApnsNotifications).not.toHaveBeenCalled();
    expect(publishLocalMailHint).toHaveBeenCalledOnce();
  });

  it("prunes tokens APNs rejects", async () => {
    vi.mocked(deliverApnsNotifications).mockResolvedValue({
      unregisteredTokens: ["b".repeat(64)],
      retryTokens: [],
    });

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(prisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ["b".repeat(64)] } },
    });
  });

  it("still sends when the cooldown store is unavailable", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("Unavailable"));

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(deliverApnsNotifications).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
