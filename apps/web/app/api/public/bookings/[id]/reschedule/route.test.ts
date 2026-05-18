import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnforceRescheduleRateLimit, mockReschedulePublicBooking } =
  vi.hoisted(() => ({
    mockEnforceRescheduleRateLimit: vi.fn(),
    mockReschedulePublicBooking: vi.fn(),
  }));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/booking/public-rate-limit", () => ({
  enforcePublicBookingRescheduleRateLimit: mockEnforceRescheduleRateLimit,
}));

vi.mock("@/utils/booking/public", () => ({
  reschedulePublicBooking: mockReschedulePublicBooking,
}));

import { POST } from "./route";

describe("public booking reschedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRescheduleRateLimit.mockResolvedValue(undefined);
    mockReschedulePublicBooking.mockResolvedValue({
      id: "booking-id",
      status: "CONFIRMED",
      startTime: "2026-05-11T09:00:00.000Z",
      endTime: "2026-05-11T09:30:00.000Z",
      cancelUrl: "/book/cancel/booking-id?token=manage-token",
      rescheduleUrl: "/book/reschedule/booking-id?token=manage-token",
    });
  });

  it("rate limits the booking id and client IP before rescheduling", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/public/bookings/booking-id/reschedule",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.1, 203.0.113.9",
        },
        body: JSON.stringify({
          token: "manage-token",
          startTime: "2026-05-11T09:00:00.000Z",
          timezone: "America/New_York",
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "booking-id" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "booking-id",
      status: "CONFIRMED",
    });
    expect(mockEnforceRescheduleRateLimit).toHaveBeenCalledWith({
      bookingId: "booking-id",
      clientIp: "203.0.113.9",
      logger: expect.any(Object),
    });
    expect(mockReschedulePublicBooking).toHaveBeenCalledWith({
      id: "booking-id",
      token: "manage-token",
      startTime: "2026-05-11T09:00:00.000Z",
      guestTimezone: "America/New_York",
      logger: expect.any(Object),
    });
    expect(
      mockEnforceRescheduleRateLimit.mock.invocationCallOrder[0],
    ).toBeLessThan(mockReschedulePublicBooking.mock.invocationCallOrder[0]);
  });
});
