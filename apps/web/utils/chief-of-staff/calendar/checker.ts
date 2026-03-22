import { parseEventPrefix, PrefixType } from "./prefix-parser";
import { isDayProtected } from "./day-protection";
import {
  type CalendarAvailability,
  type CalendarConflict,
  CALENDAR_IDS,
  SOFT_CALENDARS,
  TIMEZONE,
} from "../types";

interface CheckCalendarParams {
  calendarClient: any; // Google Calendar API client (calendar_v3.Calendar)
  endTime: Date;
  isVip: boolean;
  startTime: Date;
}

const BUFFER_MS = 15 * 60 * 1000; // 15 minutes

const CALENDAR_NAMES: Record<string, string> = {
  [CALENDAR_IDS.personal]: "Personal",
  [CALENDAR_IDS.smartCollege]: "Smart College",
  [CALENDAR_IDS.rmsWork]: "RMS Work",
  [CALENDAR_IDS.praxis]: "Praxis",
  [CALENDAR_IDS.nutrition]: "Nutrition",
  [CALENDAR_IDS.workout]: "Workout",
};

export async function checkCalendarAvailability(
  params: CheckCalendarParams,
): Promise<CalendarAvailability> {
  // 1. Check day protection first (short-circuit)
  const dayCheck = isDayProtected(params.startTime, params.isVip);
  if (dayCheck.protected) {
    return {
      available: false,
      hardBlocks: [
        {
          title: dayCheck.reason!,
          calendar: "Day Protection",
          start: params.startTime.toISOString(),
          end: params.endTime.toISOString(),
        },
      ],
      softConflicts: [],
    };
  }

  // 2. Add 15-min buffer
  const bufferedStart = new Date(params.startTime.getTime() - BUFFER_MS);
  const bufferedEnd = new Date(params.endTime.getTime() + BUFFER_MS);

  const hardBlocks: CalendarConflict[] = [];
  const softConflicts: CalendarConflict[] = [];

  // 3. Query all 6 calendars
  const calendarIds = Object.values(CALENDAR_IDS);
  const results = await Promise.allSettled(
    calendarIds.map((calId) =>
      params.calendarClient.events.list({
        calendarId: calId,
        timeMin: bufferedStart.toISOString(),
        timeMax: bufferedEnd.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        timeZone: TIMEZONE,
      }),
    ),
  );

  // 4. Process events
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") continue;

    const calId = calendarIds[i];
    const calName = CALENDAR_NAMES[calId] ?? "Unknown";
    const events = result.value.data.items ?? [];

    for (const event of events) {
      if (!event.summary) continue;
      const parsed = parseEventPrefix(event.summary);
      const eventStart = event.start?.dateTime ?? event.start?.date ?? "";
      const eventEnd = event.end?.dateTime ?? event.end?.date ?? "";
      const conflict: CalendarConflict = {
        title: parsed.cleanTitle,
        calendar: calName,
        start: eventStart,
        end: eventEnd,
      };

      // FYI events always ignored
      if (parsed.type === PrefixType.INFORMATIONAL) continue;

      // RMS Work calendar: always hard block (school commitments non-negotiable)
      if (calId === CALENDAR_IDS.rmsWork) {
        hardBlocks.push(conflict);
        continue;
      }

      // Nutrition/Workout: always soft
      if (SOFT_CALENDARS.has(calId)) {
        softConflicts.push(conflict);
        continue;
      }

      // Apply prefix convention
      if (parsed.type === PrefixType.SOFT) {
        softConflicts.push(conflict);
      } else {
        hardBlocks.push(conflict);
      }
    }
  }

  return { available: hardBlocks.length === 0, hardBlocks, softConflicts };
}
