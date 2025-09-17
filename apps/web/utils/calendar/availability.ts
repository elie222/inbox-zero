import type { calendar_v3 } from "@googleapis/calendar";
import { getCalendarClientWithRefresh } from "./client";
import { createScopedLogger } from "@/utils/logger";
import { startOfDay, endOfDay } from "date-fns";

const logger = createScopedLogger("calendar/availability");

export type TimeSlot = {
  start: string;
  end: string;
  available: boolean;
};

export type CalendarAvailability = {
  date: string;
  timeSlots: TimeSlot[];
  busyPeriods: Array<{
    start: string;
    end: string;
    calendarId: string;
  }>;
};

/**
 * Fetch busy periods from Google Calendar for specified calendars
 */
async function fetchCalendarBusyPeriods({
  calendarClient,
  calendarIds,
  timeMin,
  timeMax,
}: {
  calendarClient: calendar_v3.Calendar;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
}) {
  try {
    const response = await calendarClient.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const busyPeriods: Array<{
      start: string;
      end: string;
      calendarId: string;
    }> = [];

    if (response.data.calendars) {
      for (const [calendarId, calendar] of Object.entries(
        response.data.calendars,
      )) {
        if (calendar.busy) {
          for (const period of calendar.busy) {
            if (period.start && period.end) {
              busyPeriods.push({
                start: period.start,
                end: period.end,
                calendarId,
              });
            }
          }
        }
      }
    }

    return busyPeriods;
  } catch (error) {
    logger.error("Error fetching calendar busy periods", { error });
    throw error;
  }
}

/**
 * Merge busy periods from multiple calendars to get unified availability
 */
export function mergeBusyPeriods(
  busyPeriods: Array<{ start: string; end: string }>,
): Array<{ start: string; end: string }> {
  if (busyPeriods.length === 0) return [];

  // Sort periods by start time
  const sorted = [...busyPeriods].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const merged: Array<{ start: string; end: string }> = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = new Date(current.end);
    const nextStart = new Date(next.start);

    // If periods overlap or are adjacent, merge them
    if (currentEnd >= nextStart) {
      // Extend the current period if the next one ends later
      if (new Date(next.end) > currentEnd) {
        current.end = next.end;
      }
    } else {
      // No overlap, add current period and start a new one
      merged.push(current);
      current = { ...next };
    }
  }

  // Add the last period
  merged.push(current);

  return merged;
}

/**
 * Generate time slots for a day with availability status
 */
export function generateTimeSlots({
  date,
  busyPeriods,
  startHour,
  endHour,
  slotDurationMinutes = 30,
}: {
  date: Date;
  busyPeriods: Array<{ start: string; end: string }>;
  startHour: number;
  endHour: number;
  slotDurationMinutes?: number;
}): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);

  let currentSlotStart = new Date(dayStart);

  while (currentSlotStart < dayEnd) {
    const currentSlotEnd = new Date(currentSlotStart);
    currentSlotEnd.setMinutes(
      currentSlotEnd.getMinutes() + slotDurationMinutes,
    );

    // Check if this slot overlaps with any busy period
    const isAvailable = !busyPeriods.some((busy) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return (
        (currentSlotStart >= busyStart && currentSlotStart < busyEnd) ||
        (currentSlotEnd > busyStart && currentSlotEnd <= busyEnd) ||
        (currentSlotStart <= busyStart && currentSlotEnd >= busyEnd)
      );
    });

    slots.push({
      start: currentSlotStart.toISOString(),
      end: currentSlotEnd.toISOString(),
      available: isAvailable,
    });

    currentSlotStart = new Date(currentSlotEnd);
  }

  return slots;
}

/**
 * Get calendar availability for a specific date across all calendars
 */
export async function getCalendarAvailability({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
  calendarIds,
  startDate,
  endDate,
  startHour,
  endHour,
  slotDurationMinutes = 30,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
  calendarIds: string[];
  startDate: Date;
  endDate: Date;
  startHour: number;
  endHour: number;
  slotDurationMinutes?: number;
}): Promise<CalendarAvailability> {
  const calendarClient = await getCalendarClientWithRefresh({
    accessToken,
    refreshToken,
    expiresAt,
    emailAccountId,
  });

  const timeMin = startOfDay(startDate).toISOString();
  const timeMax = endOfDay(endDate).toISOString();

  const busyPeriods = await fetchCalendarBusyPeriods({
    calendarClient,
    calendarIds,
    timeMin,
    timeMax,
  });

  // Merge overlapping busy periods across all calendars
  const mergedBusyPeriods = mergeBusyPeriods(
    busyPeriods.map(({ start, end }) => ({ start, end })),
  );

  // For now, generate time slots for the start date only
  // TODO: Consider generating slots for multiple days if needed
  const timeSlots = generateTimeSlots({
    date: startDate,
    busyPeriods: mergedBusyPeriods,
    startHour,
    endHour,
    slotDurationMinutes,
  });

  return {
    date: startDate.toISOString().split("T")[0],
    timeSlots,
    busyPeriods,
  };
}

/**
 * Get suggested available time slots
 */
export function getSuggestedTimeSlots(
  timeSlots: TimeSlot[],
  maxSuggestions = 3,
): string[] {
  const availableSlots = timeSlots.filter((slot) => slot.available);

  // Prefer morning slots, then afternoon
  const morningSlots = availableSlots.filter(
    (slot) => new Date(slot.start).getHours() < 12,
  );
  const afternoonSlots = availableSlots.filter(
    (slot) => new Date(slot.start).getHours() >= 12,
  );

  const suggestions: string[] = [];

  // Add morning slots first
  for (const slot of morningSlots) {
    if (suggestions.length >= maxSuggestions) break;
    const time = new Date(slot.start).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    suggestions.push(time);
  }

  // Fill remaining with afternoon slots
  for (const slot of afternoonSlots) {
    if (suggestions.length >= maxSuggestions) break;
    const time = new Date(slot.start).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    suggestions.push(time);
  }

  return suggestions;
}
