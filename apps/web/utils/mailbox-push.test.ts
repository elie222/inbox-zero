import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApnsEnvironment } from "@/generated/prisma/enums";
import { deliverApnsNotifications } from "@/utils/apns";
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
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(prisma.mobilePushToken.findMany).mockResolvedValue([
      {
        token: "a".repeat(64),
        environment: ApnsEnvironment.SANDBOX,
      },
      {
        token: "b".repeat(64),
        environment: ApnsEnvironment.PRODUCTION,
      },
    ] as never);
  });

  it("sends a silent push per device environment and wakes desktop", async () => {
    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(publishLocalMailHint).toHaveBeenCalledWith("account-1", logger);
    expect(redis.set).toHaveBeenCalledWith(
      "mailbox-push-cooldown:account-1",
      "1",
      { nx: true, ex: 20 },
    );
    expect(deliverApnsNotifications).toHaveBeenCalledTimes(2);
    expect(deliverApnsNotifications).toHaveBeenCalledWith({
      tokens: ["a".repeat(64)],
      sandbox: true,
      notification: {
        pushType: "background",
        data: { emailAccountId: "account-1", hint: "mailbox" },
      },
      logger,
    });
    expect(deliverApnsNotifications).toHaveBeenCalledWith({
      tokens: ["b".repeat(64)],
      sandbox: false,
      notification: {
        pushType: "background",
        data: { emailAccountId: "account-1", hint: "mailbox" },
      },
      logger,
    });
  });

  it("coalesces a second push for the same account inside the window", async () => {
    vi.mocked(prisma.mobilePushToken.findMany).mockResolvedValue([
      {
        token: "a".repeat(64),
        environment: ApnsEnvironment.SANDBOX,
      },
    ] as never);
    vi.mocked(redis.set).mockImplementation(async () => {
      const calls = vi.mocked(redis.set).mock.calls.length;
      return calls === 1 ? "OK" : null;
    });

    await notifyMailboxChanged({ emailAccountId: "account-1", logger });
    await notifyMailboxChanged({ emailAccountId: "account-1", logger });

    expect(deliverApnsNotifications).toHaveBeenCalledOnce();
    expect(publishLocalMailHint).toHaveBeenCalledTimes(2);
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
