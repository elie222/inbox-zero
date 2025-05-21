import { Frequency } from "@prisma/client";
import { addDays, setHours, setMinutes } from "date-fns";

export const DAYS = {
  SUNDAY: 0b1000000, // 64
  MONDAY: 0b0100000, // 32
  TUESDAY: 0b0010000, // 16
  WEDNESDAY: 0b0001000, // 8
  THURSDAY: 0b0000100, // 4
  FRIDAY: 0b0000010, // 2
  SATURDAY: 0b0000001, // 1
};

export function calculateNextDigestDate(frequency: {
  intervalDays: number | null;
  daysOfWeek: number | null;
  timeOfDay: Date | null;
}) {
  const now = new Date();
  const targetTime = frequency.timeOfDay || setHours(setMinutes(now, 0), 23); // Default to 11 PM

  // Set the target time for today
  const todayWithTargetTime = setHours(
    setMinutes(now, targetTime.getMinutes()),
    targetTime.getHours(),
  );

  // If we're past today's target time, start from tomorrow
  const startDate = now > todayWithTargetTime ? addDays(now, 1) : now;

  if (!frequency.daysOfWeek) {
    // For daily frequency
    if (frequency.intervalDays === 1) {
      return setHours(
        setMinutes(startDate, targetTime.getMinutes()),
        targetTime.getHours(),
      );
    }
    // For weekly frequency
    if (frequency.intervalDays === 7) {
      // Find the next Monday
      const daysUntilMonday = (8 - startDate.getDay()) % 7;
      const nextMonday = addDays(startDate, daysUntilMonday);
      return setHours(
        setMinutes(nextMonday, targetTime.getMinutes()),
        targetTime.getHours(),
      );
    }
  }

  // For custom weekly patterns
  if (frequency.daysOfWeek) {
    let nextDate = startDate;
    let found = false;

    // Look ahead up to 7 days
    for (let i = 0; i < 7; i++) {
      const dayOfWeek = nextDate.getDay();
      const dayMask = 1 << (6 - dayOfWeek);

      if (frequency.daysOfWeek & dayMask) {
        found = true;
        break;
      }

      nextDate = addDays(nextDate, 1);
    }

    if (found) {
      return setHours(
        setMinutes(nextDate, targetTime.getMinutes()),
        targetTime.getHours(),
      );
    }
  }

  // Fallback to next day at target time
  return setHours(
    setMinutes(addDays(startDate, 1), targetTime.getMinutes()),
    targetTime.getHours(),
  );
}

export function frequencyToUserFrequency(frequency: Frequency) {
  switch (frequency) {
    case Frequency.DAILY:
      return {
        intervalDays: 1,
        daysOfWeek: null,
        timeOfDay: setHours(setMinutes(new Date(), 0), 11), // 11 AM
      };
    case Frequency.WEEKLY:
      return {
        intervalDays: 7,
        daysOfWeek: DAYS.MONDAY, // Monday only
        timeOfDay: setHours(setMinutes(new Date(), 0), 11), // 11 AM
      };
    case Frequency.NEVER:
    default:
      return null;
  }
}
