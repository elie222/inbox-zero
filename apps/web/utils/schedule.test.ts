import { describe, it, expect } from "vitest";
import {
  createCanonicalTimeOfDay,
  calculateNextScheduleDate,
  DAYS,
} from "./schedule";

describe("createCanonicalTimeOfDay", () => {
  it("should create a canonical date with specified time", () => {
    const result = createCanonicalTimeOfDay(9, 30);

    expect(result.getFullYear()).toBe(1970);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("should handle midnight", () => {
    const result = createCanonicalTimeOfDay(0, 0);

    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it("should handle end of day", () => {
    const result = createCanonicalTimeOfDay(23, 59);

    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });
});

describe("DAYS constant", () => {
  it("should have correct bitmask values", () => {
    expect(DAYS.SUNDAY).toBe(0b1000000); // 64
    expect(DAYS.MONDAY).toBe(0b0100000); // 32
    expect(DAYS.TUESDAY).toBe(0b0010000); // 16
    expect(DAYS.WEDNESDAY).toBe(0b0001000); // 8
    expect(DAYS.THURSDAY).toBe(0b0000100); // 4
    expect(DAYS.FRIDAY).toBe(0b0000010); // 2
    expect(DAYS.SATURDAY).toBe(0b0000001); // 1
  });

  it("should allow combining days with bitwise OR", () => {
    const mondayWednesday = DAYS.MONDAY | DAYS.WEDNESDAY;
    expect(mondayWednesday).toBe(0b0101000); // 40

    const weekends = DAYS.SATURDAY | DAYS.SUNDAY;
    expect(weekends).toBe(0b1000001); // 65
  });
});

describe("calculateNextScheduleDate", () => {
  describe("null/undefined inputs", () => {
    it("should return null for null frequency", () => {
      const result = calculateNextScheduleDate(null as any);
      expect(result).toBeNull();
    });

    it("should return null for undefined frequency", () => {
      const result = calculateNextScheduleDate(undefined as any);
      expect(result).toBeNull();
    });

    it("should return null when no pattern is set", () => {
      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: null,
      });
      expect(result).toBeNull();
    });
  });

  describe("interval days pattern", () => {
    it("should calculate next occurrence for daily schedule", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z");
      const result = calculateNextScheduleDate(
        {
          intervalDays: 1,
          daysOfWeek: null,
          timeOfDay: null,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be next day at midnight local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should calculate next occurrence for weekly schedule", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday
      const result = calculateNextScheduleDate(
        {
          intervalDays: 7,
          daysOfWeek: null,
          timeOfDay: null,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be next week's same day at midnight
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle multiple occurrences within interval", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z");
      const result = calculateNextScheduleDate(
        {
          intervalDays: 7,
          daysOfWeek: null,
          timeOfDay: null,
          occurrences: 2,
        },
        fromDate,
      );

      // Should be 3.5 days from start of interval
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(18);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should set specific time of day when provided", () => {
      const fromDate = new Date("2024-01-15T06:00:00Z");
      const timeOfDay = createCanonicalTimeOfDay(9, 30);

      const result = calculateNextScheduleDate(
        {
          intervalDays: 1,
          daysOfWeek: null,
          timeOfDay,
          occurrences: 1,
        },
        fromDate,
      );

      expect(result?.getHours()).toBe(9);
      expect(result?.getMinutes()).toBe(30);
    });

    it("should move to next interval when current slots are past", () => {
      const fromDate = new Date("2024-01-15T23:00:00Z");
      const timeOfDay = createCanonicalTimeOfDay(9, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: 1,
          daysOfWeek: null,
          timeOfDay,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be next day at 9:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });
  });

  describe("weekly pattern with specific days", () => {
    it("should find next occurrence on same day if time hasn't passed", () => {
      const fromDate = new Date("2024-01-15T08:00:00Z"); // Monday 8 AM
      const timeOfDay = createCanonicalTimeOfDay(10, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.MONDAY,
          timeOfDay,
          occurrences: null,
        },
        fromDate,
      );

      // Should be same day at 10:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(10);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should find next occurrence on same day if time has passed", () => {
      const fromDate = new Date("2024-01-15T12:00:00Z"); // Monday 12 PM
      const timeOfDay = createCanonicalTimeOfDay(10, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.MONDAY,
          timeOfDay,
          occurrences: null,
        },
        fromDate,
      );

      // Since time has passed, should be next Monday at 10:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22); // Next Monday
      expect(result!.getHours()).toBe(10);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle multiple days of week", () => {
      const fromDate = new Date("2024-01-15T12:00:00Z"); // Monday
      const timeOfDay = createCanonicalTimeOfDay(9, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.MONDAY | DAYS.WEDNESDAY | DAYS.FRIDAY,
          timeOfDay,
          occurrences: null,
        },
        fromDate,
      );

      // Should be Wednesday at 9:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(17);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should default to midnight when no timeOfDay is set", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday 10 AM

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.TUESDAY,
          timeOfDay: null,
          occurrences: null,
        },
        fromDate,
      );

      // Should be Tuesday midnight local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should skip to next day if current day midnight has passed", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday 10 AM

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.MONDAY,
          timeOfDay: null,
          occurrences: null,
        },
        fromDate,
      );

      // Should be next Monday midnight local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle weekend schedule", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday
      const timeOfDay = createCanonicalTimeOfDay(11, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.SATURDAY | DAYS.SUNDAY,
          timeOfDay,
          occurrences: null,
        },
        fromDate,
      );

      // Should be Saturday at 11:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(20);
      expect(result!.getHours()).toBe(11);
      expect(result!.getMinutes()).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle leap year dates", () => {
      const fromDate = new Date("2024-02-28T10:00:00Z"); // 2024 is a leap year

      const result = calculateNextScheduleDate(
        {
          intervalDays: 1,
          daysOfWeek: null,
          timeOfDay: null,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be next day (Feb 29) at midnight local time
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(1); // February
      expect(result!.getDate()).toBe(29);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle year boundary", () => {
      const fromDate = new Date("2024-12-31T10:00:00Z");

      const result = calculateNextScheduleDate(
        {
          intervalDays: 1,
          daysOfWeek: null,
          timeOfDay: null,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be next day (Jan 1) at midnight local time
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(1);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle daylight saving time transitions", () => {
      // Test around DST transition (varies by timezone, but logic should be consistent)
      const fromDate = new Date("2024-03-10T10:00:00Z");
      const timeOfDay = createCanonicalTimeOfDay(14, 30);

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.SUNDAY,
          timeOfDay,
          occurrences: null,
        },
        fromDate,
      );

      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
    });

    it("should prioritize intervalDays over daysOfWeek when both are set", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday

      const result = calculateNextScheduleDate(
        {
          intervalDays: 3,
          daysOfWeek: DAYS.TUESDAY, // This should be ignored
          timeOfDay: null,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be 3 days later at midnight local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(18);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });
  });

  describe("real-world scenarios", () => {
    it("should handle daily digest at 9 AM", () => {
      const fromDate = new Date("2024-01-15T07:00:00Z");
      const timeOfDay = createCanonicalTimeOfDay(9, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: 1,
          daysOfWeek: null,
          timeOfDay,
          occurrences: 1,
        },
        fromDate,
      );

      // Should be same day at 9:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle weekly digest on Monday mornings", () => {
      const fromDate = new Date("2024-01-13T15:00:00Z"); // Saturday
      const timeOfDay = createCanonicalTimeOfDay(8, 0);

      const result = calculateNextScheduleDate(
        {
          intervalDays: null,
          daysOfWeek: DAYS.MONDAY,
          timeOfDay,
          occurrences: null,
        },
        fromDate,
      );

      // Should be Monday at 8:00 local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(8);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle bi-weekly schedule with 2 occurrences", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z");

      const result = calculateNextScheduleDate(
        {
          intervalDays: 14,
          daysOfWeek: null,
          timeOfDay: null,
          occurrences: 2,
        },
        fromDate,
      );

      // Should be 7 days later at midnight local time
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });
  });
});
