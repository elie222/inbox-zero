import { describe, expect, it } from "vitest";
import {
  createBookingLinkBody,
  publicBookingBody,
  updateBookingAvailabilityBody,
  updateDefaultAvailabilityBody,
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

  it("rejects overlapping availability windows on the same weekday", () => {
    const result = updateBookingAvailabilityBody.safeParse({
      bookingLinkId: "link-id",
      timezone: "UTC",
      minimumNoticeMinutes: 0,
      windows: [
        { weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 },
        { weekday: 1, startMinutes: 10 * 60 + 30, endMinutes: 12 * 60 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("allows adjacent windows on the same weekday and overlapping times on different weekdays", () => {
    const result = updateBookingAvailabilityBody.safeParse({
      bookingLinkId: "link-id",
      timezone: "UTC",
      minimumNoticeMinutes: 0,
      windows: [
        { weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 },
        { weekday: 1, startMinutes: 11 * 60, endMinutes: 13 * 60 },
        { weekday: 2, startMinutes: 10 * 60, endMinutes: 12 * 60 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects overlapping windows in default availability updates", () => {
    const result = updateDefaultAvailabilityBody.safeParse({
      timezone: "UTC",
      windows: [
        { weekday: 3, startMinutes: 9 * 60, endMinutes: 12 * 60 },
        { weekday: 3, startMinutes: 11 * 60, endMinutes: 14 * 60 },
      ],
    });

    expect(result.success).toBe(false);
  });
});
