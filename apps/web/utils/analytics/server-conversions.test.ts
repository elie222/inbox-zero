import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/utils/logger";

vi.mock("@/utils/fb", () => ({
  sendCompleteRegistrationEvent: vi.fn(),
}));

vi.mock("@/utils/posthog", () => ({
  trackUserSignedUp: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import {
  getRegistrationCompletedConversionEligibility,
  trackRegistrationCompletedConversion,
} from "@/utils/analytics/server-conversions";
import { sendCompleteRegistrationEvent } from "@/utils/fb";
import { trackUserSignedUp } from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";

describe("server conversion tracking", () => {
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.del).mockResolvedValue(1);
    vi.mocked(sendCompleteRegistrationEvent).mockResolvedValue({
      success: true,
    });
    vi.mocked(trackUserSignedUp).mockResolvedValue(undefined);
  });

  it("tracks each server registration conversion destination once", async () => {
    const createdAt = new Date("2026-06-08T00:00:00.000Z");

    await trackRegistrationCompletedConversion({
      userId: "user-id",
      email: "user@example.com",
      createdAt,
      eventSourceUrl: "https://example.com/setup",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      fbc: "fbc",
      fbp: "fbp",
      logger,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "conversion:facebook:registration_completed:user-id:2026-06-08T00:00:00.000Z",
      "1",
      { ex: 86_400, nx: true },
    );
    expect(redis.set).toHaveBeenCalledWith(
      "conversion:posthog:registration_completed:user-id:2026-06-08T00:00:00.000Z",
      "1",
      { ex: 86_400, nx: true },
    );
    expect(sendCompleteRegistrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-id",
        email: "user@example.com",
        eventId: expect.any(String),
      }),
    );
    expect(trackUserSignedUp).toHaveBeenCalledWith(
      "user@example.com",
      createdAt,
    );
  });

  it("skips provider calls when dedupe keys already exist", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    await trackRegistrationCompletedConversion({
      userId: "user-id",
      email: "user@example.com",
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      eventSourceUrl: "https://example.com/setup",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      fbc: "fbc",
      fbp: "fbp",
      logger,
    });

    expect(sendCompleteRegistrationEvent).not.toHaveBeenCalled();
    expect(trackUserSignedUp).not.toHaveBeenCalled();
  });

  it("continues tracking when Redis dedupe fails", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("redis unavailable"));

    await trackRegistrationCompletedConversion({
      userId: "user-id",
      email: "user@example.com",
      createdAt: new Date("2026-06-08T00:00:00.000Z"),
      eventSourceUrl: "https://example.com/setup",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      fbc: "fbc",
      fbp: "fbp",
      logger,
    });

    expect(sendCompleteRegistrationEvent).toHaveBeenCalledTimes(1);
    expect(trackUserSignedUp).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Conversion tracking dedupe failed",
      expect.objectContaining({
        provider: "facebook",
        userId: "user-id",
      }),
    );
  });

  it("returns createdAt only when a user is eligible for registration conversion tracking", async () => {
    const createdAt = new Date();
    prisma.user.findUnique.mockResolvedValue({ createdAt });

    await expect(
      getRegistrationCompletedConversionEligibility("user-id", logger),
    ).resolves.toEqual({ eligible: true, createdAt });
  });
});
