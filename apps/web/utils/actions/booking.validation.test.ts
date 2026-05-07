import { describe, expect, it } from "vitest";
import {
  createBookingLinkBody,
  publicBookingBody,
  updateBookingScheduleBody,
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

  it("accepts a booking link without an explicit slot interval", () => {
    const result = createBookingLinkBody.safeParse({
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 30,
    });

    expect(result.success).toBe(true);
    expect(result.data?.slotIntervalMinutes).toBeUndefined();
  });

  it("validates public booking timezones", () => {
    const result = publicBookingBody.safeParse({
      slug: "intro-call",
      eventTypeSlug: "meeting",
      startTime: "2026-05-08T10:00:00.000Z",
      timezone: "Not/AZone",
      guestName: "Guest",
      guestEmail: "guest@example.com",
      idempotencyToken: "token",
    });

    expect(result.success).toBe(false);
  });

  it("limits additional guest emails on public bookings", () => {
    const result = publicBookingBody.safeParse({
      slug: "intro-call",
      eventTypeSlug: "meeting",
      startTime: "2026-05-08T10:00:00.000Z",
      timezone: "UTC",
      guestName: "Guest",
      guestEmail: "guest@example.com",
      guestAdditionalEmails: Array.from(
        { length: 11 },
        (_, index) => `guest-${index}@example.com`,
      ),
      idempotencyToken: "token",
    });

    expect(result.success).toBe(false);
  });

  it("rejects schedule rules with inverted times", () => {
    const result = updateBookingScheduleBody.safeParse({
      id: "schedule-id",
      timezone: "UTC",
      rules: [{ weekday: 1, startMinutes: 17 * 60, endMinutes: 9 * 60 }],
    });

    expect(result.success).toBe(false);
  });
});
