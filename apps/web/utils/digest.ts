import { UserFrequency } from "@prisma/client";
import { addDays } from "date-fns";

export function calculateNextDigestDate(
  frequency: UserFrequency,
  fromDate: Date = new Date(),
): Date | null {
  // For interval days pattern
  if (frequency.intervalDays) {
    const nextDate = addDays(fromDate, frequency.intervalDays);

    // If timeOfDay is set, set the time
    if (frequency.timeOfDay) {
      const timeStr = frequency.timeOfDay.toTimeString().split(" ")[0];
      const [hours, minutes] = timeStr.split(":").map(Number);
      nextDate.setHours(hours, minutes, 0, 0);
      return nextDate;
    }
    return nextDate;
  }

  // For weekly pattern with specific days
  if (frequency.daysOfWeek) {
    const currentDayOfWeek = fromDate.getDay();
    const dayMask = 1 << (6 - currentDayOfWeek);

    // Find the next day that matches the pattern
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const nextDayOfWeek = (currentDayOfWeek + daysToAdd) % 7;
      const nextDayMask = 1 << (6 - nextDayOfWeek);

      if (frequency.daysOfWeek & nextDayMask) {
        const nextDate = addDays(fromDate, daysToAdd);

        // If timeOfDay is set, set the time
        if (frequency.timeOfDay) {
          const timeStr = frequency.timeOfDay.toTimeString().split(" ")[0];
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
