import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { SafeError } from "@/utils/error";
import {
  enforcePublicAvailabilityRateLimit,
  enforcePublicBookingCancelRateLimit,
  enforcePublicBookingRateLimit,
} from "@/utils/booking/public-rate-limit";

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/utils/rate-limit", async () => ({
  checkRateLimit: rateLimitMocks.checkRateLimit,
  createRateLimitKey: (parts: string[]) => parts.join(":"),
  hashRateLimitValue: (value: string) => `hash-${value}`,
}));

describe("enforcePublicBookingRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMocks.checkRateLimit.mockResolvedValue({
      limited: false,
      limit: 1,
      remaining: 1,
    });
  });

  it("checks layered booking limits", async () => {
    await enforcePublicBookingRateLimit({
      input: publicBookingInput(),
      clientIp: "203.0.113.1",
      logger: createTestLogger(),
    });

    expect(rateLimitMocks.checkRateLimit).toHaveBeenCalledTimes(5);
    expect(
      rateLimitMocks.checkRateLimit.mock.calls.map(([call]) => call.rule.id),
    ).toEqual([
      "ip-link-burst",
      "ip-link-daily",
      "guest-link-daily",
      "link-hourly",
      "link-daily",
    ]);
  });

  it("throws a 429 safe error when a booking limit is exceeded", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({
      limited: true,
      limit: 8,
      retryAfterSeconds: 600,
    });

    await expect(
      enforcePublicBookingRateLimit({
        input: publicBookingInput(),
        clientIp: "203.0.113.1",
        logger: createTestLogger(),
      }),
    ).rejects.toMatchObject({
      name: "SafeError",
      statusCode: 429,
    } satisfies Partial<SafeError>);
  });

  it("checks booking cancellation limits", async () => {
    await enforcePublicBookingCancelRateLimit({
      bookingId: "booking-id",
      clientIp: "203.0.113.1",
      logger: createTestLogger(),
    });

    expect(rateLimitMocks.checkRateLimit).toHaveBeenCalledTimes(3);
    expect(
      rateLimitMocks.checkRateLimit.mock.calls.map(([call]) => call.rule.id),
    ).toEqual([
      "ip-booking-cancel-burst",
      "ip-booking-cancel-daily",
      "booking-cancel-hourly",
    ]);
  });

  it("throws a 429 safe error when a cancellation limit is exceeded", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({
      limited: true,
      limit: 10,
      retryAfterSeconds: 600,
    });

    await expect(
      enforcePublicBookingCancelRateLimit({
        bookingId: "booking-id",
        clientIp: "203.0.113.1",
        logger: createTestLogger(),
      }),
    ).rejects.toMatchObject({
      name: "SafeError",
      statusCode: 429,
    } satisfies Partial<SafeError>);
  });

  it("checks public availability limits", async () => {
    await enforcePublicAvailabilityRateLimit({
      slug: "intro-call",
      clientIp: "203.0.113.1",
      logger: createTestLogger(),
    });

    expect(rateLimitMocks.checkRateLimit).toHaveBeenCalledTimes(3);
    expect(
      rateLimitMocks.checkRateLimit.mock.calls.map(([call]) => call.rule.id),
    ).toEqual([
      "availability-ip-link-burst",
      "availability-ip-link-daily",
      "availability-link-hourly",
    ]);
  });
});

function publicBookingInput(): Parameters<
  typeof enforcePublicBookingRateLimit
>[0]["input"] {
  return {
    slug: "intro-call",
    startTime: "2026-05-10T10:00:00.000Z",
    timezone: "UTC",
    guestName: "Guest User",
    guestEmail: "guest@example.com",
    idempotencyToken: "token",
  };
}
