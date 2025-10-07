/**
 * Schedule utility tests
 *
 * This test file is timezone-independent by:
 * 1. Setting TZ=UTC for all tests
 * 2. Using explicit UTC dates in test data
 * 3. Using createTestDate() helper for consistent date creation
 *
 * This ensures tests pass consistently across different CI environments
 * and local development machines regardless of timezone.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  bitmaskToDayOfWeek,
  bitmaskToDaysOfWeek,
  calculateNextScheduleDate,
  createCanonicalTimeOfDay,
  DAYS,
  dayOfWeekToBitmask,
} from "./schedule";

// Store original timezone
const originalTimezone = process.env.TZ;

// Set timezone to UTC for all tests to ensure consistent behavior
beforeAll(() => {
  process.env.TZ = "UTC";
});

afterAll(() => {
  // Restore original timezone
  process.env.TZ = originalTimezone || "UTC";
});

// Helper function to create timezone-independent test dates
function createTestDate(isoString: string): Date {
  return new Date(isoString);
}

// Test to verify timezone setup is working
describe("timezone setup", () => {
  it("should use UTC timezone for consistent test behavior", () => {
    const testDate = new Date("2024-01-15T10:00:00Z");
    expect(testDate.getTimezoneOffset()).toBe(0); // UTC has 0 offset
  });
});

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
    expect(DAYS.SUNDAY).toBe(0b100_0000); // 64
    expect(DAYS.MONDAY).toBe(0b010_0000); // 32
    expect(DAYS.TUESDAY).toBe(0b001_0000); // 16
    expect(DAYS.WEDNESDAY).toBe(0b000_1000); // 8
    expect(DAYS.THURSDAY).toBe(0b000_0100); // 4
    expect(DAYS.FRIDAY).toBe(0b000_0010); // 2
    expect(DAYS.SATURDAY).toBe(0b000_0001); // 1
  });

  it("should allow combining days with bitwise OR", () => {
    const mondayWednesday = DAYS.MONDAY | DAYS.WEDNESDAY;
    expect(mondayWednesday).toBe(0b010_1000); // 40

    const weekends = DAYS.SATURDAY | DAYS.SUNDAY;
    expect(weekends).toBe(0b100_0001); // 65
  });
});

describe("dayOfWeekToBitmask", () => {
  it("should convert JavaScript day of week to correct bitmask", () => {
    expect(dayOfWeekToBitmask(0)).toBe(DAYS.SUNDAY); // 64
    expect(dayOfWeekToBitmask(1)).toBe(DAYS.MONDAY); // 32
    expect(dayOfWeekToBitmask(2)).toBe(DAYS.TUESDAY); // 16
    expect(dayOfWeekToBitmask(3)).toBe(DAYS.WEDNESDAY); // 8
    expect(dayOfWeekToBitmask(4)).toBe(DAYS.THURSDAY); // 4
    expect(dayOfWeekToBitmask(5)).toBe(DAYS.FRIDAY); // 2
    expect(dayOfWeekToBitmask(6)).toBe(DAYS.SATURDAY); // 1
  });

  it("should throw error for invalid day values", () => {
    expect(() => dayOfWeekToBitmask(-1)).toThrow(
      "Invalid day of week: -1. Must be integer between 0 and 6.",
    );
    expect(() => dayOfWeekToBitmask(7)).toThrow(
      "Invalid day of week: 7. Must be integer between 0 and 6.",
    );
    expect(() => dayOfWeekToBitmask(1.5)).toThrow(
      "Invalid day of week: 1.5. Must be integer between 0 and 6.",
    );
  });
});

describe("bitmaskToDayOfWeek", () => {
  it("should convert individual day bitmasks to JavaScript day of week", () => {
    expect(bitmaskToDayOfWeek(DAYS.SUNDAY)).toBe(0);
    expect(bitmaskToDayOfWeek(DAYS.MONDAY)).toBe(1);
    expect(bitmaskToDayOfWeek(DAYS.TUESDAY)).toBe(2);
    expect(bitmaskToDayOfWeek(DAYS.WEDNESDAY)).toBe(3);
    expect(bitmaskToDayOfWeek(DAYS.THURSDAY)).toBe(4);
    expect(bitmaskToDayOfWeek(DAYS.FRIDAY)).toBe(5);
    expect(bitmaskToDayOfWeek(DAYS.SATURDAY)).toBe(6);
  });

  it("should return null for empty bitmask", () => {
    expect(bitmaskToDayOfWeek(0)).toBeNull();
  });

  it("should return first day when multiple days are set", () => {
    // Sunday and Wednesday
    expect(bitmaskToDayOfWeek(DAYS.SUNDAY | DAYS.WEDNESDAY)).toBe(0);

    // Monday and Friday
    expect(bitmaskToDayOfWeek(DAYS.MONDAY | DAYS.FRIDAY)).toBe(1);

    // Tuesday, Thursday, Saturday
    expect(
      bitmaskToDayOfWeek(DAYS.TUESDAY | DAYS.THURSDAY | DAYS.SATURDAY),
    ).toBe(2);
  });

  it("should handle all days set", () => {
    const allDays =
      DAYS.SUNDAY |
      DAYS.MONDAY |
      DAYS.TUESDAY |
      DAYS.WEDNESDAY |
      DAYS.THURSDAY |
      DAYS.FRIDAY |
      DAYS.SATURDAY;
    expect(bitmaskToDayOfWeek(allDays)).toBe(0); // Should return Sunday (first day)
  });
});

describe("bitmaskToDaysOfWeek", () => {
  it("should convert individual day bitmasks to array with single day", () => {
    expect(bitmaskToDaysOfWeek(DAYS.SUNDAY)).toEqual([0]);
    expect(bitmaskToDaysOfWeek(DAYS.MONDAY)).toEqual([1]);
    expect(bitmaskToDaysOfWeek(DAYS.TUESDAY)).toEqual([2]);
    expect(bitmaskToDaysOfWeek(DAYS.WEDNESDAY)).toEqual([3]);
    expect(bitmaskToDaysOfWeek(DAYS.THURSDAY)).toEqual([4]);
    expect(bitmaskToDaysOfWeek(DAYS.FRIDAY)).toEqual([5]);
    expect(bitmaskToDaysOfWeek(DAYS.SATURDAY)).toEqual([6]);
  });

  it("should return empty array for empty bitmask", () => {
    expect(bitmaskToDaysOfWeek(0)).toEqual([]);
  });

  it("should return all days when multiple days are set", () => {
    // Sunday and Wednesday
    expect(bitmaskToDaysOfWeek(DAYS.SUNDAY | DAYS.WEDNESDAY)).toEqual([0, 3]);

    // Monday, Wednesday, Friday
    expect(
      bitmaskToDaysOfWeek(DAYS.MONDAY | DAYS.WEDNESDAY | DAYS.FRIDAY),
    ).toEqual([1, 3, 5]);

    // Weekend days
    expect(bitmaskToDaysOfWeek(DAYS.SATURDAY | DAYS.SUNDAY)).toEqual([0, 6]);
  });

  it("should handle all days set", () => {
    const allDays =
      DAYS.SUNDAY |
      DAYS.MONDAY |
      DAYS.TUESDAY |
      DAYS.WEDNESDAY |
      DAYS.THURSDAY |
      DAYS.FRIDAY |
      DAYS.SATURDAY;
    expect(bitmaskToDaysOfWeek(allDays)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("should return days in order from Sunday to Saturday", () => {
    // Mixed order input should return ordered output
    const mixedDays = DAYS.FRIDAY | DAYS.TUESDAY | DAYS.SUNDAY | DAYS.THURSDAY;
    expect(bitmaskToDaysOfWeek(mixedDays)).toEqual([0, 2, 4, 5]); // Sunday, Tuesday, Thursday, Friday
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
      const fromDate = new Date("2024-01-15T10:00:00Z");
      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });
      expect(result).toBeNull();
    });
  });

  describe("interval days pattern", () => {
    it("should calculate next occurrence for daily schedule", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z");
      const result = calculateNextScheduleDate({
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be next day at midnight
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should calculate next occurrence for weekly schedule", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday
      const result = calculateNextScheduleDate({
        intervalDays: 7,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be next week's same day at midnight
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle multiple occurrences within interval", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z");
      const result = calculateNextScheduleDate({
        intervalDays: 7,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 2,
        lastOccurrenceAt: fromDate,
      });

      // Should be 3.5 days from start of interval
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(18);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should set specific time of day when provided", () => {
      const fromDate = new Date("2024-01-15T06:00:00Z");
      const timeOfDay = createCanonicalTimeOfDay(9, 30);

      const result = calculateNextScheduleDate({
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      expect(result?.getHours()).toBe(9);
      expect(result?.getMinutes()).toBe(30);
    });

    it("should move to next interval when current slots are past", () => {
      const fromDate = new Date("2024-01-15T23:00:00Z");
      const timeOfDay = createCanonicalTimeOfDay(9, 0);

      const result = calculateNextScheduleDate({
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be next day at 9:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });
  });

  describe("weekly pattern with specific days", () => {
    it("should find next occurrence on same day if time hasn't passed", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-15T08:00:00Z"); // Monday 8 AM UTC
      const timeOfDay = createCanonicalTimeOfDay(10, 0);

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.MONDAY,
        timeOfDay,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Should be same day at 10:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(10);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should find next occurrence on next week when time has passed today", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-15T14:00:00Z"); // Monday 2 PM UTC
      const timeOfDay = createCanonicalTimeOfDay(10, 0); // 10 AM

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.MONDAY,
        timeOfDay,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Current time is 2 PM UTC, but 10 AM scheduled time has already passed today, so schedule for next Monday at 10:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22); // Next Monday
      expect(result!.getHours()).toBe(10);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle multiple days of week", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-15T12:00:00Z"); // Monday
      const timeOfDay = createCanonicalTimeOfDay(9, 0);

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.MONDAY | DAYS.WEDNESDAY | DAYS.FRIDAY,
        timeOfDay,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Should be Wednesday at 9:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(17);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should default to midnight when no timeOfDay is set", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-15T10:00:00Z"); // Monday 10 AM UTC

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.TUESDAY,
        timeOfDay: null,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Should be Tuesday at midnight
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should skip to next week when current day midnight has passed", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-15T10:00:00Z"); // Monday 10 AM UTC

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.MONDAY,
        timeOfDay: null,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Should be next Monday at midnight (since it's 10 AM, midnight has already passed today)
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle weekend schedule", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-15T10:00:00Z"); // Monday
      const timeOfDay = createCanonicalTimeOfDay(11, 0);

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.SATURDAY | DAYS.SUNDAY,
        timeOfDay,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Should be Saturday at 11:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(20);
      expect(result!.getHours()).toBe(11);
      expect(result!.getMinutes()).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle leap year dates", () => {
      const fromDate = new Date("2024-02-28T10:00:00Z"); // 2024 is a leap year

      const result = calculateNextScheduleDate({
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be next day (Feb 29) at midnight
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(1); // February
      expect(result!.getDate()).toBe(29);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle year boundary", () => {
      const fromDate = new Date("2024-12-31T10:00:00Z");

      const result = calculateNextScheduleDate({
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be next day (Jan 1) at midnight
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

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.SUNDAY,
        timeOfDay,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      expect(result?.getHours()).toBe(14);
      expect(result?.getMinutes()).toBe(30);
    });

    it("should prioritize intervalDays over daysOfWeek when both are set", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // Monday

      const result = calculateNextScheduleDate({
        intervalDays: 3,
        daysOfWeek: DAYS.TUESDAY, // This should be ignored
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be 3 days later at midnight
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

      const result = calculateNextScheduleDate({
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be same day at 9:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle weekly digest on Monday mornings", () => {
      const fromDate = new Date("2024-01-13T15:00:00Z"); // Saturday
      const timeOfDay = createCanonicalTimeOfDay(8, 0);

      const result = calculateNextScheduleDate({
        intervalDays: null,
        daysOfWeek: DAYS.MONDAY,
        timeOfDay,
        occurrences: null,
        lastOccurrenceAt: fromDate,
      });

      // Should be Monday at 8:00 AM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getHours()).toBe(8);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle bi-weekly schedule with 2 occurrences", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z");

      const result = calculateNextScheduleDate({
        intervalDays: 14,
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 2,
        lastOccurrenceAt: fromDate,
      });

      // Should be 7 days later at midnight
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(22);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle monthly schedule when time has passed today", () => {
      // Using UTC dates to ensure timezone independence
      const fromDate = createTestDate("2024-01-10T16:00:00Z"); // January 10th 4 PM UTC
      const timeOfDay = createCanonicalTimeOfDay(9, 0); // 9 AM

      const result = calculateNextScheduleDate({
        intervalDays: 30, // Approximately monthly
        daysOfWeek: null,
        timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Current time is 4 PM UTC, but 9 AM scheduled time has already passed today, so schedule for next interval (30 days later)
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(1); // February
      expect(result!.getDate()).toBe(9);
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle monthly schedule when current day is past the 15th", () => {
      const fromDate = new Date("2024-01-20T10:00:00Z"); // January 20th
      const timeOfDay = createCanonicalTimeOfDay(15, 30);

      const result = calculateNextScheduleDate({
        intervalDays: 30, // Approximately monthly
        daysOfWeek: null,
        timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Current time is 10 AM UTC, but 3:30 PM scheduled time hasn't passed yet, so schedule for same day at 3:30 PM
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(20);
      expect(result!.getHours()).toBe(15);
      expect(result!.getMinutes()).toBe(30);
    });

    it("should handle monthly schedule with time that has passed today", () => {
      const fromDate = new Date("2024-01-15T16:00:00Z"); // January 15th 4 PM
      const timeOfDay = createCanonicalTimeOfDay(10, 0); // 10 AM

      const result = calculateNextScheduleDate({
        intervalDays: 30, // Approximately monthly
        daysOfWeek: null,
        timeOfDay,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be February 14th at 10:00 AM (30 days later, since 10 AM has passed today)
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(1); // February
      expect(result!.getDate()).toBe(14);
      expect(result!.getHours()).toBe(10);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle monthly schedule across year boundary", () => {
      const fromDate = new Date("2024-12-15T10:00:00Z"); // December 15th

      const result = calculateNextScheduleDate({
        intervalDays: 30, // Approximately monthly
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be January 14th at midnight (30 days later, crosses year boundary)
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(14);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle monthly schedule with leap year", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // January 15th, 2024 is leap year

      const result = calculateNextScheduleDate({
        intervalDays: 30, // Approximately monthly
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be February 14th at midnight (30 days later, accounting for leap year)
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(1); // February
      expect(result!.getDate()).toBe(14);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle monthly schedule with multiple occurrences", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // January 15th

      const result = calculateNextScheduleDate({
        intervalDays: 30, // Approximately monthly
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 2, // Two occurrences within 30 days,
        lastOccurrenceAt: fromDate,
      });

      // Should be January 30th at midnight (15 days later, first occurrence)
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(30);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle very long intervals efficiently", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // January 15th

      const result = calculateNextScheduleDate({
        intervalDays: 365, // Yearly
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1,
        lastOccurrenceAt: fromDate,
      });

      // Should be next year at midnight (365 days later, accounting for leap year)
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(14); // 365 days from Jan 15 = Jan 14 (leap year)
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle very long intervals with many occurrences", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // January 15th

      const result = calculateNextScheduleDate({
        intervalDays: 365, // Yearly
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 365, // Daily occurrences within a year,
        lastOccurrenceAt: fromDate,
      });

      // Should be next day at midnight (first occurrence within the year)
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(16); // Next day
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it("should handle extreme intervals efficiently", () => {
      const fromDate = new Date("2024-01-15T10:00:00Z"); // January 15th

      const result = calculateNextScheduleDate({
        intervalDays: 1000, // Very long interval
        daysOfWeek: null,
        timeOfDay: null,
        occurrences: 1000, // Many occurrences,
        lastOccurrenceAt: fromDate,
      });

      // Should be next day at midnight (first occurrence within the interval)
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0); // January
      expect(result!.getDate()).toBe(16); // Next day
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });
  });
});

describe("calculateNextScheduleDate - Bug Fix Tests", () => {
  describe("time drift bug fix", () => {
    it("should calculate next occurrence from lastOccurrenceAt, not current time", () => {
      // This test verifies the fix for the 30-minute digest issue
      // where schedules were drifting forward in time with each processing

      const schedule = {
        intervalDays: 1, // Daily
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(0, 0), // Midnight
        lastOccurrenceAt: createTestDate("2024-01-15T00:00:00Z"), // Last sent at midnight
      };

      // Simulate the bug: if we used current time (12:36 PM) instead of lastOccurrenceAt
      const _currentTime = createTestDate("2024-01-15T12:36:00Z"); // 12:36 PM

      // With the fix: should calculate from lastOccurrenceAt (midnight)
      const result = calculateNextScheduleDate(schedule);

      // Should be next day at midnight (2024-01-16T00:00:00Z)
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16);
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
      expect(result!.getSeconds()).toBe(0);
    });

    it("should handle missing lastOccurrenceAt by using current time", () => {
      // Test fallback behavior when lastOccurrenceAt is null
      const schedule = {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(9, 0), // 9 AM
        lastOccurrenceAt: null, // No previous occurrence
      };

      const result = calculateNextScheduleDate(schedule);

      // Should calculate from current time (fallback behavior)
      expect(result).not.toBeNull();
      // The exact time will depend on when the test runs, but should be in the future
      expect(result!.getTime()).toBeGreaterThan(Date.now());
    });

    it("should maintain consistent daily schedule timing", () => {
      // Test that multiple calls with the same lastOccurrenceAt produce the same result
      const schedule = {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(14, 30), // 2:30 PM
        lastOccurrenceAt: createTestDate("2024-01-15T14:30:00Z"),
      };

      const result1 = calculateNextScheduleDate(schedule);
      const result2 = calculateNextScheduleDate(schedule);

      // Both calls should produce the same result
      expect(result1).toEqual(result2);
      expect(result1!.getDate()).toBe(16); // Next day
      expect(result1!.getHours()).toBe(14);
      expect(result1!.getMinutes()).toBe(30);
    });

    it("should prevent schedule drift in digest processing scenario", () => {
      // Simulate the exact scenario from the bug report
      const originalScheduledTime = createTestDate("2024-01-15T00:00:00Z"); // Midnight
      const _processingTime = createTestDate("2024-01-15T12:36:40Z"); // 12:36 PM (when cron processed it)

      const schedule = {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(0, 0), // Midnight
        lastOccurrenceAt: originalScheduledTime, // Use the original scheduled time
      };

      const result = calculateNextScheduleDate(schedule);

      // Should be next day at midnight, NOT at 12:36 PM
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(16); // Next day
      expect(result!.getHours()).toBe(0); // Midnight, not 12:36 PM
      expect(result!.getMinutes()).toBe(0);

      // This prevents the 30-minute cron from finding the account "due" again
      // because the next occurrence is at midnight, not at 12:36 PM
    });
  });
});
