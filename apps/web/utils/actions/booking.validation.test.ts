import { describe, expect, it } from "vitest";
import {
  createBookingLinkBody,
  publicBookingBody,
  updateBookingAvailabilityBody,
} from "@/utils/actions/booking.validation";

describe("booking action validation", () => {
  it("rejects reserved booking link slugs", () => {
    const result = createBookingLinkBody.safeParse({
      title: "Intro call",
      slug: "login",
      timezone: "UTC",
      durationMinutes: 30,
    });

    expect(result.success).toBe(false);
  });

  it("validates public booking timezones", () => {
    const result = publicBookingBody.safeParse({
      slug: "intro-call",
      startTime: "2026-05-08T10:00:00.000Z",
      timezone: "Not/AZone",
      guestName: "Guest",
      guestEmail: "guest@example.com",
      idempotencyToken: "token",
    });

    expect(result.success).toBe(false);
  });

  it("rejects availability windows with inverted times", () => {
    const result = updateBookingAvailabilityBody.safeParse({
      bookingLinkId: "link-id",
      timezone: "UTC",
      minimumNoticeMinutes: 0,
      windows: [{ weekday: 1, startMinutes: 17 * 60, endMinutes: 9 * 60 }],
    });

    expect(result.success).toBe(false);
  });
});
