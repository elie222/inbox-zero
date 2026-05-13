import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMessagingFollowUpContext,
  saveMessagingFollowUpContext,
} from "@/utils/redis/messaging-follow-up-context";

vi.mock("@/env", () => ({
  env: {
    UPSTASH_REDIS_URL: "https://redis.example",
    UPSTASH_REDIS_TOKEN: "token",
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { redis } from "@/utils/redis";

describe("messaging-follow-up-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves and reads back the email reference for a Slack notification thread", async () => {
    const stored: Record<string, unknown> = {};
    vi.mocked(redis.set).mockImplementation(async (key: string, value: any) => {
      stored[key] = value;
      return "OK" as any;
    });
    vi.mocked(redis.get).mockImplementation(
      async (key: string) => (stored[key] as any) ?? null,
    );

    const key = {
      provider: "slack" as const,
      channelId: "C123",
      messageTs: "1700000000.000100",
    };

    await saveMessagingFollowUpContext(key, {
      emailAccountId: "email-account-1",
      threadId: "thread-abc",
      messageId: "message-xyz",
      trackerId: "tracker-1",
      subject: "Q3 renewal",
      counterpartyEmail: "alex@example.com",
    });

    const result = await getMessagingFollowUpContext(key);

    expect(result).toEqual({
      emailAccountId: "email-account-1",
      threadId: "thread-abc",
      messageId: "message-xyz",
      trackerId: "tracker-1",
      subject: "Q3 renewal",
      counterpartyEmail: "alex@example.com",
    });
  });

  it("returns null when no context is stored for the lookup key", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const result = await getMessagingFollowUpContext({
      provider: "telegram",
      channelId: "12345",
      messageTs: "67",
    });

    expect(result).toBeNull();
  });

  it("partitions keys by provider and message identifier", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK" as any);

    await saveMessagingFollowUpContext(
      { provider: "slack", channelId: "C1", messageTs: "111" },
      {
        emailAccountId: "ea-1",
        threadId: "t-1",
        messageId: "m-1",
        trackerId: "tr-1",
        subject: "s",
        counterpartyEmail: "a@b",
      },
    );
    await saveMessagingFollowUpContext(
      { provider: "telegram", channelId: "C1", messageTs: "111" },
      {
        emailAccountId: "ea-2",
        threadId: "t-2",
        messageId: "m-2",
        trackerId: "tr-2",
        subject: "s",
        counterpartyEmail: "a@b",
      },
    );

    const slackKey = vi.mocked(redis.set).mock.calls[0][0] as string;
    const telegramKey = vi.mocked(redis.set).mock.calls[1][0] as string;

    expect(slackKey).not.toBe(telegramKey);
    expect(slackKey).toContain(":slack:");
    expect(telegramKey).toContain(":telegram:");
    expect(slackKey).toContain(":111");
    expect(telegramKey).toContain(":111");
  });

  it("does not throw when Redis is not configured", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: {
        UPSTASH_REDIS_URL: "",
        UPSTASH_REDIS_TOKEN: "",
      },
    }));
    const { getMessagingFollowUpContext: getWithoutRedis } = await import(
      "@/utils/redis/messaging-follow-up-context"
    );

    await expect(
      getWithoutRedis({
        provider: "slack",
        channelId: "C1",
        messageTs: "1",
      }),
    ).resolves.toBeNull();
  });
});
