import type { Schedule } from "@prisma/client";
import { addDays } from "date-fns";

/**
 * Creates a canonical timeOfDay Date object using Unix epoch (1970-01-01).
 * This ensures consistency across all timeOfDay usage while preserving timezone info.
 *
 * @param hours - Hour in 24-hour format (0-23)
 * @param minutes - Minutes (0-59)
 * @returns Date object with canonical date and specified time
 */
export function createCanonicalTimeOfDay(hours: number, minutes: number): Date {
  return new Date(1970, 0, 1, hours, minutes, 0, 0);
}

/**
 * Bitmask representation of days of the week.
 * Each bit represents a day, from Sunday (most significant) to Saturday (least significant).
 * Example: 0b1000000 (64) represents Sunday, 0b0100000 (32) represents Monday, etc.
 *
 * To combine multiple days, use the bitwise OR operator (|):
 * SUNDAY | WEDNESDAY = 0b1000000 | 0b0001000 = 0b1001000
 */
export const DAYS = {
  SUNDAY: 0b100_0000, // 64
  MONDAY: 0b010_0000, // 32
  TUESDAY: 0b001_0000, // 16
  WEDNESDAY: 0b000_1000, // 8
  THURSDAY: 0b000_0100, // 4
  FRIDAY: 0b000_0010, // 2
  SATURDAY: 0b000_0001, // 1
};

/**
 * Converts a JavaScript day of week (0-6, Sunday-Saturday) to its corresponding bitmask.
 * @param jsDay - JavaScript day of week (0 = Sunday, 6 = Saturday)
 * @returns The bitmask for the given day
 */
const maskFor = (jsDay: number) => 1 << (6 - jsDay);

/**
 * Converts a JavaScript day of week (0-6, Sunday-Saturday) to its corresponding bitmask.
 * This is a public version of the internal maskFor function.
 *
 * @param jsDay - JavaScript day of week (0 = Sunday, 6 = Saturday)
 * @returns The bitmask for the given day
 * @throws Error if jsDay is not between 0 and 6
 *
 * @example
 * // Convert Sunday (0) to bitmask
 * const sundayMask = dayOfWeekToBitmask(0); // Returns 64 (0b1000000)
 *
 * // Convert Wednesday (3) to bitmask
 * const wednesdayMask = dayOfWeekToBitmask(3); // Returns 8 (0b0001000)
 */
export function dayOfWeekToBitmask(jsDay: number): number {
  if (jsDay < 0 || jsDay > 6 || !Number.isInteger(jsDay)) {
    throw new Error(
      `Invalid day of week: ${jsDay}. Must be integer between 0 and 6.`,
    );
  }
  return maskFor(jsDay);
}

/**
 * Converts a bitmask back to the first JavaScript day of week (0-6, Sunday-Saturday) it represents.
 * If multiple days are set in the bitmask, returns the first one found (Sunday first).
 *
 * @param bitmask - The days of week bitmask
 * @returns The first JavaScript day of week (0-6), or null if no days are set
 *
 * @example
 * // Convert Sunday bitmask to JS day
 * const day = bitmaskToDayOfWeek(64); // Returns 0 (Sunday)
 *
 * // Convert Wednesday bitmask to JS day
 * const day = bitmaskToDayOfWeek(8); // Returns 3 (Wednesday)
 *
 * // Multiple days set - returns first one
 * const day = bitmaskToDayOfWeek(64 | 8); // Returns 0 (Sunday, first day found)
 */
export function bitmaskToDayOfWeek(bitmask: number): number | null {
  if (bitmask === 0) return null;

  for (let jsDay = 0; jsDay < 7; jsDay++) {
    if (bitmask & maskFor(jsDay)) {
      return jsDay;
    }
  }
  return null;
}

/**
 * Gets all JavaScript days of week (0-6, Sunday-Saturday) represented in a bitmask.
 *
 * @param bitmask - The days of week bitmask
 * @returns Array of JavaScript day numbers (0-6) that are set in the bitmask
 *
 * @example
 * // Get all days from a bitmask with multiple days
 * const days = bitmaskToDaysOfWeek(64 | 8); // Returns [0, 3] (Sunday and Wednesday)
 */
export function bitmaskToDaysOfWeek(bitmask: number): number[] {
  const days: number[] = [];
  for (let jsDay = 0; jsDay < 7; jsDay++) {
    if (bitmask & maskFor(jsDay)) {
      days.push(jsDay);
    }
  }
  return days;
}

/**
 * Calculates the next occurrence date based on schedule settings.
 *
 * @param schedule - The schedule configuration
 * @param schedule.daysOfWeek - Bitmask of days of the week (see DAYS constant)
 * @param schedule.intervalDays - Number of days between occurrences
 * @param schedule.timeOfDay - Time of day for the occurrence (if unset, defaults to midnight)
 * @param schedule.occurrences - Number of occurrences within the interval
 * @param fromDate - The reference date to calculate from (defaults to current date)
 * @returns The next occurrence date, or null if no valid pattern is found
 */
export function calculateNextScheduleDate(
  frequency: Pick<
    Schedule,
    "intervalDays" | "daysOfWeek" | "timeOfDay" | "occurrences"
  >,
  fromDate: Date = new Date(),
): Date | null {
  if (!frequency) return null;

  const { intervalDays, daysOfWeek, timeOfDay, occurrences } = frequency;

  // Helper to set the time of day
  function setTime(date: Date) {
    if (timeOfDay) {
      // Extract time from canonical date (1970-01-01T00:00:00Z + time)
      // timeOfDay should always use canonical date for consistency
      const hours = timeOfDay.getHours();
      const minutes = timeOfDay.getMinutes();
      date.setHours(hours, minutes, 0, 0);
    } else {
      // Reset to midnight when no specific time is set
      date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  // For interval days pattern (e.g., every 7 days)
  if (intervalDays) {
    const occ = occurrences && occurrences > 1 ? occurrences : 1;
    const slotLength = intervalDays / occ;

    // Find the start of the current interval
    const intervalStart = new Date(fromDate);
    intervalStart.setHours(0, 0, 0, 0);

    // Find the next slot
    for (let i = 0; i < occ; i++) {
      // Calculate slot offset in days (preserves fractional spacing)
      const dayOffset = i * slotLength;
      const slotDate = addDays(intervalStart, dayOffset);
      setTime(slotDate);

      if (slotDate > fromDate) {
        return slotDate;
      }
    }
    // If all slots for this interval are in the past, return the first slot of the next interval
    const nextIntervalStart = addDays(intervalStart, intervalDays);
    setTime(nextIntervalStart);
    return nextIntervalStart;
  }

  // For weekly pattern with specific days
  if (daysOfWeek) {
    const currentDayOfWeek = fromDate.getDay();

    // Find the next day that matches the pattern, starting from today
    let daysToAdd = 0;
    while (daysToAdd < 14) {
      // Allow up to 2 weeks to find the next occurrence
      const nextDayOfWeek = (currentDayOfWeek + daysToAdd) % 7;
      const nextDayMask = maskFor(nextDayOfWeek);

      if (daysOfWeek & nextDayMask) {
        const nextDate = addDays(fromDate, daysToAdd);

        // If timeOfDay is set, set the time
        if (timeOfDay) {
          // Extract time from canonical date (1970-01-01T00:00:00Z + time)
          const hours = timeOfDay.getHours();
          const minutes = timeOfDay.getMinutes();
          nextDate.setHours(hours, minutes, 0, 0);

          // If this is today (daysToAdd === 0) and the time has already passed,
          // continue to the next day
          if (daysToAdd === 0 && nextDate <= fromDate) {
            daysToAdd++;
            continue;
          }
          return nextDate;
        }

        // Reset time to 00:00:00 when timeOfDay is not set to prevent time drift
        nextDate.setHours(0, 0, 0, 0);

        // If this is today (daysToAdd === 0) and midnight has already passed,
        // continue to the next day
        if (daysToAdd === 0 && nextDate <= fromDate) {
          daysToAdd++;
          continue;
        }
        return nextDate;
      }

      daysToAdd++;
    }
  }

  // If no valid pattern is found
  return null;
}
