import type { Schedule } from "@prisma/client";
import { addDays, addMilliseconds } from "date-fns";

/**
 * Bitmask representation of days of the week.
 * Each bit represents a day, from Sunday (most significant) to Saturday (least significant).
 * Example: 0b1000000 (64) represents Sunday, 0b0100000 (32) represents Monday, etc.
 *
 * To combine multiple days, use the bitwise OR operator (|):
 * SUNDAY | WEDNESDAY = 0b1000000 | 0b0001000 = 0b1001000
 */
export const DAYS = {
  SUNDAY: 0b1000000, // 64
  MONDAY: 0b0100000, // 32
  TUESDAY: 0b0010000, // 16
  WEDNESDAY: 0b0001000, // 8
  THURSDAY: 0b0000100, // 4
  FRIDAY: 0b0000010, // 2
  SATURDAY: 0b0000001, // 1
};

/**
 * Converts a JavaScript day of week (0-6, Sunday-Saturday) to its corresponding bitmask.
 * @param jsDay - JavaScript day of week (0 = Sunday, 6 = Saturday)
 * @returns The bitmask for the given day
 */
const maskFor = (jsDay: number) => 1 << (6 - jsDay);

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
export function calculateNextFrequencyDate(
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
      const timeStr = timeOfDay.toTimeString().split(" ")[0];
      const [hours, minutes] = timeStr.split(":").map(Number);
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
      // Calculate exact offset in milliseconds (slotLength * 24 * 60 * 60 * 1000)
      const offsetMs = i * slotLength * 24 * 60 * 60 * 1000;
      const slotDate = addMilliseconds(intervalStart, offsetMs);
      setTime(slotDate);
      if (slotDate >= fromDate) {
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
    while (daysToAdd <= 7) {
      const nextDayOfWeek = (currentDayOfWeek + daysToAdd) % 7;
      const nextDayMask = maskFor(nextDayOfWeek);

      if (daysOfWeek & nextDayMask) {
        const nextDate = addDays(fromDate, daysToAdd);

        // If timeOfDay is set, set the time
        if (timeOfDay) {
          const timeStr = timeOfDay.toTimeString().split(" ")[0];
          const [hours, minutes] = timeStr.split(":").map(Number);
          nextDate.setHours(hours, minutes, 0, 0);

          // If this is today (daysToAdd === 0) and the time has already passed,
          // continue to the next day
          if (daysToAdd === 0 && nextDate <= fromDate) {
            daysToAdd++;
            continue;
          }
          return nextDate;
        }
        return nextDate;
      }

      daysToAdd++;
    }
  }

  // If no valid pattern is found
  return null;
}
