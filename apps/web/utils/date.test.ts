import { describe, it, expect } from "vitest";
import {
  formatInUserTimezone,
  formatTimeInUserTimezone,
  formatDateTimeInUserTimezone,
} from "./date";

describe("timezone formatting", () => {
  // A fixed UTC timestamp: Dec 30, 2024 at 7:00 PM UTC
  // This is the same moment in time, but displays differently in different timezones
  const utcDate = new Date("2024-12-30T19:00:00Z");

  describe("formatTimeInUserTimezone", () => {
    it("should format time in Brazil timezone (UTC-3)", () => {
      // 7 PM UTC = 4 PM BRT (UTC-3)
      const result = formatTimeInUserTimezone(utcDate, "America/Sao_Paulo");
      expect(result).toBe("4:00 PM");
    });

    it("should format time in US Eastern timezone (UTC-5)", () => {
      // 7 PM UTC = 2 PM EST (UTC-5)
      const result = formatTimeInUserTimezone(utcDate, "America/New_York");
      expect(result).toBe("2:00 PM");
    });

    it("should format time in US Pacific timezone (UTC-8)", () => {
      // 7 PM UTC = 11 AM PST (UTC-8)
      const result = formatTimeInUserTimezone(utcDate, "America/Los_Angeles");
      expect(result).toBe("11:00 AM");
    });

    it("should format time in Israel timezone (UTC+2)", () => {
      // 7 PM UTC = 9 PM IST (UTC+2)
      const result = formatTimeInUserTimezone(utcDate, "Asia/Jerusalem");
      expect(result).toBe("9:00 PM");
    });

    it("should format time in Japan timezone (UTC+9)", () => {
      // 7 PM UTC = 4 AM next day JST (UTC+9)
      const result = formatTimeInUserTimezone(utcDate, "Asia/Tokyo");
      expect(result).toBe("4:00 AM");
    });

    it("should default to UTC when timezone is null", () => {
      const result = formatTimeInUserTimezone(utcDate, null);
      expect(result).toBe("7:00 PM");
    });

    it("should default to UTC when timezone is undefined", () => {
      const result = formatTimeInUserTimezone(utcDate, undefined);
      expect(result).toBe("7:00 PM");
    });
  });

  describe("formatDateTimeInUserTimezone", () => {
    it("should format date and time in Brazil timezone", () => {
      // 7 PM UTC = 4 PM BRT on Dec 30
      const result = formatDateTimeInUserTimezone(utcDate, "America/Sao_Paulo");
      expect(result).toBe("Dec 30, 2024 at 4:00 PM");
    });

    it("should format date and time in US Pacific timezone", () => {
      // 7 PM UTC = 11 AM PST on Dec 30
      const result = formatDateTimeInUserTimezone(
        utcDate,
        "America/Los_Angeles",
      );
      expect(result).toBe("Dec 30, 2024 at 11:00 AM");
    });

    it("should handle date change when crossing midnight (Japan)", () => {
      // 7 PM UTC on Dec 30 = 4 AM JST on Dec 31
      const result = formatDateTimeInUserTimezone(utcDate, "Asia/Tokyo");
      expect(result).toBe("Dec 31, 2024 at 4:00 AM");
    });

    it("should handle date change when going backwards (Pacific)", () => {
      // 3 AM UTC on Dec 30 = 7 PM PST on Dec 29
      const earlyUtc = new Date("2024-12-30T03:00:00Z");
      const result = formatDateTimeInUserTimezone(
        earlyUtc,
        "America/Los_Angeles",
      );
      expect(result).toBe("Dec 29, 2024 at 7:00 PM");
    });

    it("should default to UTC when timezone is null", () => {
      const result = formatDateTimeInUserTimezone(utcDate, null);
      expect(result).toBe("Dec 30, 2024 at 7:00 PM");
    });
  });

  describe("formatInUserTimezone with custom format", () => {
    it("should support custom format strings", () => {
      const result = formatInUserTimezone(
        utcDate,
        "America/Sao_Paulo",
        "yyyy-MM-dd HH:mm",
      );
      expect(result).toBe("2024-12-30 16:00");
    });

    it("should support 24-hour time format", () => {
      // 7 PM UTC = 21:00 in Jerusalem
      const result = formatInUserTimezone(utcDate, "Asia/Jerusalem", "HH:mm");
      expect(result).toBe("21:00");
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
});
