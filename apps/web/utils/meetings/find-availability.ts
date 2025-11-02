import {
  addDays,
  addMinutes,
  startOfDay,
  endOfDay,
  isWithinInterval,
  isBefore,
  isAfter,
  parse,
  parseISO,
} from "date-fns";
import { TZDate } from "@date-fns/tz";
import { createScopedLogger } from "@/utils/logger";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import type { BusyPeriod } from "@/utils/calendar/availability-types";
import type { ParsedMeetingRequest } from "@/utils/meetings/parse-meeting-request";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("meetings/find-availability");

export interface AvailableTimeSlot {
  start: Date;
  end: Date;
  startISO: string;
  endISO: string;
}

export interface MeetingAvailability {
  requestedTimes: AvailableTimeSlot[];
  suggestedTimes: AvailableTimeSlot[];
  timezone: string;
  hasConflicts: boolean;
}

/**
 * Find available time slots for a meeting request
 *
 * Process:
 * 1. Get user's timezone from calendar
 * 2. Parse date/time preferences from meeting request
 * 3. Fetch busy periods from all calendars
 * 4. Check if requested times are available
 * 5. Suggest alternative times if requested times are busy
 */
export async function findMeetingAvailability({
  emailAccountId,
  meetingRequest,
}: {
  emailAccountId: string;
  meetingRequest: ParsedMeetingRequest;
}): Promise<MeetingAvailability> {
  logger.info("Finding meeting availability", {
    emailAccountId,
    datePreferences: meetingRequest.dateTimePreferences,
    duration: meetingRequest.durationMinutes,
  });

  // Get user's timezone from calendar connections
  const timezone = await getUserTimezone(emailAccountId);

  // Parse requested time slots from natural language preferences
  const requestedTimes = parseTimePreferences(
    meetingRequest.dateTimePreferences,
    meetingRequest.durationMinutes,
    timezone,
  );

  logger.trace("Parsed requested times", {
    count: requestedTimes.length,
    times: requestedTimes.map((t) => t.startISO),
  });

  // If no specific times requested, suggest times for the next 7 days
  if (requestedTimes.length === 0) {
    const suggestedTimes = await findSuggestedTimes({
      emailAccountId,
      durationMinutes: meetingRequest.durationMinutes,
      daysAhead: 7,
      timezone,
    });

    return {
      requestedTimes: [],
      suggestedTimes,
      timezone,
      hasConflicts: false,
    };
  }

  // Get busy periods for the date range covering all requested times
  const { startDate, endDate } = getDateRange(requestedTimes);
  const busyPeriods = await getUnifiedCalendarAvailability({
    emailAccountId,
    startDate,
    endDate,
    timezone,
  });

  logger.trace("Fetched busy periods", {
    count: busyPeriods.length,
  });

  // Check which requested times are available
  const availableRequestedTimes = requestedTimes.filter((slot) =>
    isTimeSlotAvailable(slot, busyPeriods),
  );

  const hasConflicts = availableRequestedTimes.length < requestedTimes.length;

  // If all requested times are busy, suggest alternative times
  let suggestedTimes: AvailableTimeSlot[] = [];
  if (hasConflicts) {
    suggestedTimes = await findSuggestedTimes({
      emailAccountId,
      durationMinutes: meetingRequest.durationMinutes,
      daysAhead: 7,
      timezone,
      preferredStartHour: getPreferredStartHour(requestedTimes),
    });
  }

  logger.info("Meeting availability found", {
    requestedCount: requestedTimes.length,
    availableCount: availableRequestedTimes.length,
    suggestedCount: suggestedTimes.length,
    hasConflicts,
  });

  return {
    requestedTimes: availableRequestedTimes,
    suggestedTimes,
    timezone,
    hasConflicts,
  };
}

/**
 * Find suggested available time slots
 */
async function findSuggestedTimes({
  emailAccountId,
  durationMinutes,
  daysAhead,
  timezone,
  preferredStartHour = 9, // Default to 9 AM
  maxSuggestions = 5,
}: {
  emailAccountId: string;
  durationMinutes: number;
  daysAhead: number;
  timezone: string;
  preferredStartHour?: number;
  maxSuggestions?: number;
}): Promise<AvailableTimeSlot[]> {
  const now = new Date();
  const startDate = startOfDay(now);
  const endDate = endOfDay(addDays(now, daysAhead));

  // Get busy periods
  const busyPeriods = await getUnifiedCalendarAvailability({
    emailAccountId,
    startDate,
    endDate,
    timezone,
  });

  const suggestions: AvailableTimeSlot[] = [];

  // Working hours: 9 AM to 5 PM by default
  const workStartHour = 9;
  const workEndHour = 17;

  // Start checking from tomorrow
  let currentDay = addDays(startOfDay(now), 1);
  let daysChecked = 0;

  while (suggestions.length < maxSuggestions && daysChecked < daysAhead) {
    // Try slots at the preferred hour and nearby times
    const hoursToTry = [
      preferredStartHour,
      preferredStartHour + 1,
      preferredStartHour - 1,
      10,
      14,
      15,
    ].filter((h) => h >= workStartHour && h < workEndHour);

    for (const hour of hoursToTry) {
      if (suggestions.length >= maxSuggestions) break;

      const slotStart = new TZDate(currentDay, timezone);
      slotStart.setHours(hour, 0, 0, 0);

      const slot: AvailableTimeSlot = {
        start: slotStart,
        end: addMinutes(slotStart, durationMinutes),
        startISO: slotStart.toISOString(),
        endISO: addMinutes(slotStart, durationMinutes).toISOString(),
      };

      // Check if this slot is available and not a duplicate
      if (
        isTimeSlotAvailable(slot, busyPeriods) &&
        !suggestions.some((s) => s.startISO === slot.startISO)
      ) {
        suggestions.push(slot);
      }
    }

    currentDay = addDays(currentDay, 1);
    daysChecked++;
  }

  return suggestions;
}

/**
 * Check if a time slot is available (doesn't conflict with busy periods)
 */
function isTimeSlotAvailable(
  slot: AvailableTimeSlot,
  busyPeriods: BusyPeriod[],
): boolean {
  for (const busy of busyPeriods) {
    const busyStart = parseISO(busy.start);
    const busyEnd = parseISO(busy.end);

    // Check if there's any overlap
    const slotStart = slot.start;
    const slotEnd = slot.end;

    // Overlap if: slot starts before busy ends AND slot ends after busy starts
    if (isBefore(slotStart, busyEnd) && isAfter(slotEnd, busyStart)) {
      return false; // Conflict found
    }
  }

  return true; // No conflicts
}

/**
 * Parse natural language time preferences into time slots
 */
function parseTimePreferences(
  preferences: string[],
  durationMinutes: number,
  timezone: string,
): AvailableTimeSlot[] {
  const slots: AvailableTimeSlot[] = [];
  const now = new Date();

  for (const pref of preferences) {
    try {
      // Try to parse common patterns
      const parsed = parseNaturalLanguageTime(pref, timezone);
      if (parsed) {
        const slot: AvailableTimeSlot = {
          start: parsed,
          end: addMinutes(parsed, durationMinutes),
          startISO: parsed.toISOString(),
          endISO: addMinutes(parsed, durationMinutes).toISOString(),
        };
        slots.push(slot);
      }
    } catch (error) {
      logger.warn("Failed to parse time preference", {
        preference: pref,
        error,
      });
    }
  }

  return slots;
}

/**
 * Parse natural language time expressions
 * Examples: "tomorrow at 2pm", "next Tuesday at 10am", "Jan 15 at 3pm"
 */
function parseNaturalLanguageTime(text: string, timezone: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase().trim();

  // Extract time (e.g., "2pm", "10:30am", "14:00")
  const timeMatch = lowerText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!timeMatch) return null;

  let hours = Number.parseInt(timeMatch[1]);
  const minutes = timeMatch[2] ? Number.parseInt(timeMatch[2]) : 0;
  const meridiem = timeMatch[3]?.toLowerCase();

  // Convert to 24-hour format
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  // Determine the date
  let targetDate: Date;

  if (lowerText.includes("tomorrow")) {
    targetDate = addDays(startOfDay(now), 1);
  } else if (lowerText.includes("today")) {
    targetDate = startOfDay(now);
  } else if (lowerText.includes("next week")) {
    targetDate = addDays(startOfDay(now), 7);
  } else if (lowerText.includes("monday")) {
    targetDate = getNextDayOfWeek(now, 1);
  } else if (lowerText.includes("tuesday")) {
    targetDate = getNextDayOfWeek(now, 2);
  } else if (lowerText.includes("wednesday")) {
    targetDate = getNextDayOfWeek(now, 3);
  } else if (lowerText.includes("thursday")) {
    targetDate = getNextDayOfWeek(now, 4);
  } else if (lowerText.includes("friday")) {
    targetDate = getNextDayOfWeek(now, 5);
  } else if (lowerText.includes("saturday")) {
    targetDate = getNextDayOfWeek(now, 6);
  } else if (lowerText.includes("sunday")) {
    targetDate = getNextDayOfWeek(now, 0);
  } else {
    // Try parsing as a date (e.g., "Jan 15", "January 15", "15 Jan")
    const dateMatch = lowerText.match(
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i,
    );
    if (dateMatch) {
      const month = dateMatch[1];
      const day = Number.parseInt(dateMatch[2]);
      const monthNames = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ];
      const monthIndex = monthNames.findIndex((m) => month.startsWith(m));
      if (monthIndex >= 0) {
        targetDate = new Date(now.getFullYear(), monthIndex, day);
        // If the date is in the past, assume next year
        if (isBefore(targetDate, now)) {
          targetDate = new Date(now.getFullYear() + 1, monthIndex, day);
        }
      } else {
        return null;
      }
    } else {
      // Default to tomorrow if can't parse the date
      targetDate = addDays(startOfDay(now), 1);
    }
  }

  // Create the final date with time in the specified timezone
  const result = new TZDate(targetDate, timezone);
  result.setHours(hours, minutes, 0, 0);

  return result;
}

/**
 * Get the next occurrence of a day of the week
 */
function getNextDayOfWeek(from: Date, dayOfWeek: number): Date {
  const current = startOfDay(from);
  const currentDay = current.getDay();
  let daysToAdd = dayOfWeek - currentDay;

  if (daysToAdd <= 0) {
    daysToAdd += 7; // Next week
  }

  return addDays(current, daysToAdd);
}

/**
 * Get the date range covering all time slots
 */
function getDateRange(slots: AvailableTimeSlot[]): {
  startDate: Date;
  endDate: Date;
} {
  const dates = slots.flatMap((s) => [s.start, s.end]);
  return {
    startDate: new Date(Math.min(...dates.map((d) => d.getTime()))),
    endDate: new Date(Math.max(...dates.map((d) => d.getTime()))),
  };
}

/**
 * Extract preferred start hour from requested times
 */
function getPreferredStartHour(slots: AvailableTimeSlot[]): number {
  if (slots.length === 0) return 9; // Default to 9 AM

  const hours = slots.map((s) => s.start.getHours());
  const avgHour = Math.round(
    hours.reduce((sum, h) => sum + h, 0) / hours.length,
  );

  return avgHour;
}

/**
 * Get user's timezone from calendar connections
 */
async function getUserTimezone(emailAccountId: string): Promise<string> {
  const calendarConnections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId,
      isConnected: true,
    },
    include: {
      calendars: {
        where: { isEnabled: true },
        select: {
          timezone: true,
          primary: true,
        },
      },
    },
  });

  // First, try to find the primary calendar's timezone
  for (const connection of calendarConnections) {
    const primaryCalendar = connection.calendars.find((cal) => cal.primary);
    if (primaryCalendar?.timezone) {
      return primaryCalendar.timezone;
    }
  }

  // If no primary calendar found, find any calendar with a timezone
  for (const connection of calendarConnections) {
    for (const calendar of connection.calendars) {
      if (calendar.timezone) {
        return calendar.timezone;
      }
    }
  }

  // Fallback to UTC if no timezone information is available
  return "UTC";
}
