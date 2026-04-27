import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: "phc_test_key",
    NEXT_PUBLIC_POSTHOG_API_HOST: undefined,
    NODE_ENV: "test",
  },
}));

const captureMock = vi.fn();
const shutdownMock = vi.fn().mockResolvedValue(undefined);

vi.mock("posthog-node", () => ({
  PostHog: class PostHogMock {
    capture = captureMock;
    shutdown = shutdownMock;
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

import { FIRST_TIME_EVENTS, trackFirstTimeEvent } from "./posthog";
import { redis } from "@/utils/redis";

describe("trackFirstTimeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures PostHog once when Redis grants the NX lock and user email exists", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: "person@example.com" },
    } as any);

    await trackFirstTimeEvent({
      emailAccountId: "acct-1",
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
      properties: { source: "test" },
    });

    expect(redis.set).toHaveBeenCalledWith(
      `first-event:acct-1:${FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE}`,
      "1",
      { nx: true },
    );
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "person@example.com",
        event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
        properties: expect.objectContaining({
          emailAccountId: "acct-1",
          source: "test",
        }),
      }),
    );
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it("does not capture when Redis reports the dedupe key already exists", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await trackFirstTimeEvent({
      emailAccountId: "acct-2",
      event: FIRST_TIME_EVENTS.FIRST_AUTOMATED_RULE_RUN,
    });

    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("does not hit Redis on a second call for the same account and event in-process", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: "repeat@example.com" },
    } as any);

    await trackFirstTimeEvent({
      emailAccountId: "acct-3",
      event: FIRST_TIME_EVENTS.FIRST_DRAFT_SENT,
    });
    await trackFirstTimeEvent({
      emailAccountId: "acct-3",
      event: FIRST_TIME_EVENTS.FIRST_DRAFT_SENT,
    });

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("does not capture when the email account has no user email", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: null },
    } as any);

    await trackFirstTimeEvent({
      emailAccountId: "orphan-acct",
      event: FIRST_TIME_EVENTS.FIRST_CHAT_MESSAGE,
    });

    expect(captureMock).not.toHaveBeenCalled();
  });
});
