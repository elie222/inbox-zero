import { describe, expect, it } from "vitest";
import { formatInvitationTime } from "@/utils/calendar/invitations/format-time";

describe("formatInvitationTime", () => {
  it("renders an instant in the viewer's timezone", () => {
    expect(
      formatInvitationTime(
        {
          start: "2026-09-29T16:00:00.000Z",
          end: "2026-09-29T16:05:00.000Z",
          allDay: false,
        },
        "America/Sao_Paulo",
      ),
    ).toBe("Tuesday, September 29, 2026 · 1:00 PM – 1:05 PM");
  });

  // The string the calendar-invitation browser spec asserts, pinned here so a
  // formatting change fails in unit tests rather than only in Playwright.
  it("renders a same-day range for a UTC viewer", () => {
    expect(
      formatInvitationTime(
        {
          start: "2026-10-01T10:00:00.000Z",
          end: "2026-10-01T10:30:00.000Z",
          allDay: false,
        },
        "UTC",
      ),
    ).toBe("Thursday, October 1, 2026 · 10:00 AM – 10:30 AM");
  });

  it("keeps both dates when an event spans days", () => {
    expect(
      formatInvitationTime(
        {
          start: "2026-09-29T22:00:00.000Z",
          end: "2026-09-30T01:00:00.000Z",
          allDay: false,
        },
        "UTC",
      ),
    ).toBe("Tue, Sep 29, 2026, 10:00 PM – Wed, Sep 30, 2026, 1:00 AM");
  });

  it("renders a start without an end", () => {
    expect(
      formatInvitationTime(
        { start: "2026-09-29T16:00:00.000Z", end: null, allDay: false },
        "UTC",
      ),
    ).toBe("Tuesday, September 29, 2026 · 4:00 PM");
  });

  it("treats the all-day end date as exclusive", () => {
    expect(
      formatInvitationTime(
        { start: "2026-09-10", end: "2026-09-11", allDay: true },
        "America/Sao_Paulo",
      ),
    ).toBe("Thursday, September 10, 2026");
    expect(
      formatInvitationTime(
        { start: "2026-09-10", end: "2026-09-12", allDay: true },
        "America/Sao_Paulo",
      ),
    ).toBe("Thursday, September 10, 2026 – Friday, September 11, 2026");
  });

  // A floating time has no zone, so every viewer reads the same wall clock.
  it.each([
    "UTC",
    "America/Sao_Paulo",
    "Asia/Tokyo",
  ])("renders a floating time as written in %s", (timeZone) => {
    expect(
      formatInvitationTime(
        { start: "2026-09-29T13:00:00", end: null, allDay: false },
        timeZone,
      ),
    ).toBe("Tuesday, September 29, 2026 · 1:00 PM");
  });
});
