import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnforcePublicAvailabilityRateLimit,
  mockGetPublicAvailability,
  mockGetPublicBookingAvailabilityExclusion,
} = vi.hoisted(() => ({
  mockEnforcePublicAvailabilityRateLimit: vi.fn(),
  mockGetPublicAvailability: vi.fn(),
  mockGetPublicBookingAvailabilityExclusion: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/booking/public-rate-limit", () => ({
  enforcePublicAvailabilityRateLimit: mockEnforcePublicAvailabilityRateLimit,
}));

vi.mock("@/utils/booking/public", () => ({
  getPublicAvailability: mockGetPublicAvailability,
  getPublicBookingAvailabilityExclusion:
    mockGetPublicBookingAvailabilityExclusion,
}));

import { GET } from "./route";

describe("public booking availability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforcePublicAvailabilityRateLimit.mockResolvedValue(undefined);
    mockGetPublicAvailability.mockResolvedValue([
      {
        start: "2026-05-11T09:00:00.000Z",
        end: "2026-05-11T09:30:00.000Z",
      },
    ]);
  });

  it("passes matching reschedule exclusions into availability lookup", async () => {
    const providerBusyPeriod = {
      start: new Date("2026-05-11T09:00:00.000Z"),
      end: new Date("2026-05-11T09:30:00.000Z"),
    };
    mockGetPublicBookingAvailabilityExclusion.mockResolvedValue({
      id: "booking-id",
      bookingLinkSlug: "intro-call",
      providerBusyPeriod,
    });

    const response = await GET(
      createAvailabilityRequest({
        rescheduleBookingId: "booking-id",
        token: "manage-token",
      }),
      { params: Promise.resolve({ slug: "intro-call" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      slots: [
        {
          start: "2026-05-11T09:00:00.000Z",
          end: "2026-05-11T09:30:00.000Z",
        },
      ],
    });
    expect(mockEnforcePublicAvailabilityRateLimit).toHaveBeenCalledWith({
      slug: "intro-call",
      clientIp: "203.0.113.9",
      logger: expect.any(Object),
    });
    expect(mockGetPublicBookingAvailabilityExclusion).toHaveBeenCalledWith({
      id: "booking-id",
      token: "manage-token",
    });
    expect(mockGetPublicAvailability).toHaveBeenCalledWith({
      slug: "intro-call",
      start: new Date("2026-05-11T00:00:00.000Z"),
      end: new Date("2026-05-12T00:00:00.000Z"),
      excludeBookingId: "booking-id",
      excludeBusyPeriod: providerBusyPeriod,
      logger: expect.any(Object),
    });
  });

  it("does not apply a reschedule exclusion from a different booking link", async () => {
    mockGetPublicBookingAvailabilityExclusion.mockResolvedValue({
      id: "booking-id",
      bookingLinkSlug: "other-link",
      providerBusyPeriod: {
        start: new Date("2026-05-11T09:00:00.000Z"),
        end: new Date("2026-05-11T09:30:00.000Z"),
      },
    });

    const response = await GET(
      createAvailabilityRequest({
        rescheduleBookingId: "booking-id",
        token: "manage-token",
      }),
      { params: Promise.resolve({ slug: "intro-call" }) },
    );

    expect(response.status).toBe(200);
    expect(mockGetPublicAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "intro-call",
        excludeBookingId: undefined,
        excludeBusyPeriod: undefined,
      }),
    );
  });

  it("does not look up reschedule exclusions unless both id and token are present", async () => {
    const response = await GET(
      createAvailabilityRequest({
        rescheduleBookingId: "booking-id",
      }),
      { params: Promise.resolve({ slug: "intro-call" }) },
    );

    expect(response.status).toBe(200);
    expect(mockGetPublicBookingAvailabilityExclusion).not.toHaveBeenCalled();
    expect(mockGetPublicAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeBookingId: undefined,
        excludeBusyPeriod: undefined,
      }),
    );
  });
});

function createAvailabilityRequest({
  rescheduleBookingId,
  token,
}: {
  rescheduleBookingId?: string;
  token?: string;
} = {}) {
  const url = new URL(
    "http://localhost:3000/api/public/booking-links/intro-call/availability",
  );
  url.searchParams.set("start", "2026-05-11T00:00:00.000Z");
  url.searchParams.set("end", "2026-05-12T00:00:00.000Z");
  if (rescheduleBookingId) {
    url.searchParams.set("rescheduleBookingId", rescheduleBookingId);
  }
  if (token) {
    url.searchParams.set("token", token);
  }

  return new NextRequest(url, {
    headers: {
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
    },
  });
}
