import type { UserFrequency } from "@prisma/client";
import { addDays } from "date-fns";

export const DAYS = {
  SUNDAY: 0b1000000, // 64
  MONDAY: 0b0100000, // 32
  TUESDAY: 0b0010000, // 16
  WEDNESDAY: 0b0001000, // 8
  THURSDAY: 0b0000100, // 4
  FRIDAY: 0b0000010, // 2
  SATURDAY: 0b0000001, // 1
};

export function calculateNextFrequencyDate(
  frequency: Pick<
    UserFrequency,
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
      const slotDate = addDays(intervalStart, Math.round(i * slotLength));
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

    // Find the next day that matches the pattern
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const nextDayOfWeek = (currentDayOfWeek + daysToAdd) % 7;
      const nextDayMask = 1 << (6 - nextDayOfWeek);

      if (daysOfWeek & nextDayMask) {
        const nextDate = addDays(fromDate, daysToAdd);

        // If timeOfDay is set, set the time
        if (timeOfDay) {
          const timeStr = timeOfDay.toTimeString().split(" ")[0];
          const [hours, minutes] = timeStr.split(":").map(Number);
          nextDate.setHours(hours, minutes, 0, 0);
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
