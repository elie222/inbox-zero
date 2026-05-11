import { describe, it, expect } from "vitest";
import {
  getElapsedBusinessDaysForDisplay,
  formatInUserTimezone,
  formatTimeInUserTimezone,
  formatDateTimeInUserTimezone,
  hasElapsedBusinessDays,
  internalDateToDate,
} from "./date";

describe("timezone formatting", () => {
  // A fixed UTC timestamp: Dec 30, 2024 at 7:00 PM UTC
  // This is the same moment in time, but displays differently in different timezones
  const utcDate = new Date("2024-12-30T19:00:00Z");

  describe("formatTimeInUserTimezone", () => {
    it.each([
      {
        name: "Brazil timezone (UTC-3)",
        timezone: "America/Sao_Paulo",
        expected: "4:00 PM",
      },
      {
        name: "US Eastern timezone (UTC-5)",
        timezone: "America/New_York",
        expected: "2:00 PM",
      },
      {
        name: "US Pacific timezone (UTC-8)",
        timezone: "America/Los_Angeles",
        expected: "11:00 AM",
      },
      {
        name: "Israel timezone (UTC+2)",
        timezone: "Asia/Jerusalem",
        expected: "9:00 PM",
      },
      {
        name: "Japan timezone (UTC+9)",
        timezone: "Asia/Tokyo",
        expected: "4:00 AM",
      },
      {
        name: "null timezone",
        timezone: null,
        expected: "7:00 PM",
      },
      {
        name: "undefined timezone",
        timezone: undefined,
        expected: "7:00 PM",
      },
    ])("should format time in $name", ({ timezone, expected }) => {
      expect(formatTimeInUserTimezone(utcDate, timezone)).toBe(expected);
    });
  });

  describe("formatDateTimeInUserTimezone", () => {
    it.each([
      {
        name: "Brazil timezone",
        date: utcDate,
        timezone: "America/Sao_Paulo",
        expected: "Dec 30, 2024 at 4:00 PM",
      },
      {
        name: "US Pacific timezone",
        date: utcDate,
        timezone: "America/Los_Angeles",
        expected: "Dec 30, 2024 at 11:00 AM",
      },
      {
        name: "date change crossing midnight in Japan",
        date: utcDate,
        timezone: "Asia/Tokyo",
        expected: "Dec 31, 2024 at 4:00 AM",
      },
      {
        name: "date change going backwards in Pacific time",
        date: new Date("2024-12-30T03:00:00Z"),
        timezone: "America/Los_Angeles",
        expected: "Dec 29, 2024 at 7:00 PM",
      },
      {
        name: "null timezone",
        date: utcDate,
        timezone: null,
        expected: "Dec 30, 2024 at 7:00 PM",
      },
    ])("should format date and time for $name", ({
      date,
      timezone,
      expected,
    }) => {
      expect(formatDateTimeInUserTimezone(date, timezone)).toBe(expected);
    });
  });

  describe("formatInUserTimezone with custom format", () => {
    it.each([
      {
        name: "custom date-time format",
        timezone: "America/Sao_Paulo",
        format: "yyyy-MM-dd HH:mm",
        expected: "2024-12-30 16:00",
      },
      {
        name: "24-hour time format",
        timezone: "Asia/Jerusalem",
        format: "HH:mm",
        expected: "21:00",
      },
    ])("should support $name", ({ timezone, format, expected }) => {
      expect(formatInUserTimezone(utcDate, timezone, format)).toBe(expected);
    });
  });

  describe("real-world briefing scenarios", () => {
    it("should correctly format a 4 PM BRT meeting for a BRT user", () => {
      // User has a meeting at 4 PM BRT (which is stored as 7 PM UTC in the calendar)
      const meetingTimeUtc = new Date("2024-12-30T19:00:00Z");
      const userTimezone = "America/Sao_Paulo";

      const formattedTime = formatTimeInUserTimezone(
        meetingTimeUtc,
        userTimezone,
      );

      // User should see "4:00 PM", not "7:00 PM"
      expect(formattedTime).toBe("4:00 PM");
    });

    it("should correctly format a morning meeting across date line", () => {
      // Meeting at 10 AM in Sydney (which is 11 PM previous day UTC)
      const sydneyMorningUtc = new Date("2024-12-29T23:00:00Z");
      const userTimezone = "Australia/Sydney";

      const formattedDateTime = formatDateTimeInUserTimezone(
        sydneyMorningUtc,
        userTimezone,
      );

      // User should see Dec 30 at 10 AM, not Dec 29
      expect(formattedDateTime).toBe("Dec 30, 2024 at 10:00 AM");
    });
  });

  describe("invalid timezone handling", () => {
    it.each([
      {
        name: "invalid timezone strings",
        timezone: "Invalid/Timezone",
        expected: "7:00 PM",
      },
      {
        name: "legacy timezone abbreviations that TZDate supports",
        timezone: "EST",
        expected: "2:00 PM",
      },
    ])("should format time for $name", ({ timezone, expected }) => {
      expect(formatTimeInUserTimezone(utcDate, timezone)).toBe(expected);
    });

    it("should fall back to UTC for corrupted timezone data", () => {
      const result = formatDateTimeInUserTimezone(
        utcDate,
        "corrupted_data_123",
      );
      expect(result).toBe("Dec 30, 2024 at 7:00 PM");
    });
  });
});

describe("internalDateToDate", () => {
  it.each([
    { name: "internalDate is missing", internalDate: undefined },
    { name: "internalDate is invalid", internalDate: "not-a-date" },
  ])("returns invalid date when fallbackToNow is false and $name", ({
    internalDate,
  }) => {
    const parsed = internalDateToDate(internalDate, { fallbackToNow: false });

    expect(Number.isNaN(parsed.getTime())).toBe(true);
  });

  it("parses ISO internalDate values", () => {
    const parsed = internalDateToDate("2026-02-20T12:00:00.000Z");

    expect(parsed.getTime()).toBe(
      new Date("2026-02-20T12:00:00.000Z").getTime(),
    );
  });
});

describe("business day elapsed helpers", () => {
  it("does not count Saturday and Sunday toward elapsed days", () => {
    const start = new Date("2026-05-08T12:00:00.000Z");
    const end = new Date("2026-05-11T12:00:00.000Z");

    expect(
      hasElapsedBusinessDays({
        start,
        end,
        days: 3,
        windowMinutes: 15,
        timezone: "UTC",
      }),
    ).toBe(false);
  });

  it("uses the eligibility window when comparing elapsed business time", () => {
    const start = new Date("2026-05-08T12:00:00.000Z");
    const end = new Date("2026-05-13T11:50:00.000Z");

    expect(
      hasElapsedBusinessDays({
        start,
        end,
        days: 3,
        windowMinutes: 15,
        timezone: "UTC",
      }),
    ).toBe(true);
  });

  it("uses the provided timezone to determine weekends", () => {
    const start = new Date("2026-05-09T06:30:00.000Z");
    const end = new Date("2026-05-09T08:30:00.000Z");
    const twentyMinutes = 20 / (24 * 60);

    expect(
      hasElapsedBusinessDays({
        start,
        end,
        days: twentyMinutes,
        timezone: "UTC",
      }),
    ).toBe(false);
    expect(
      hasElapsedBusinessDays({
        start,
        end,
        days: twentyMinutes,
        timezone: "America/Los_Angeles",
      }),
    ).toBe(true);
  });

  it("rounds elapsed business days up for display", () => {
    expect(
      getElapsedBusinessDaysForDisplay({
        start: new Date("2026-05-08T12:00:00.000Z"),
        end: new Date("2026-05-12T13:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(3);
  });
});
