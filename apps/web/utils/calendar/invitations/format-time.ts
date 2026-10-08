import { TZDate } from "@date-fns/tz";
import { format } from "date-fns/format";
import { isSameDay } from "date-fns/isSameDay";
import { parseISO } from "date-fns/parseISO";
import { subDays } from "date-fns/subDays";

const DAY = "EEEE, MMMM d, yyyy";
const TIME = "h:mm a";
const DAY_AND_TIME = "EEE, MMM d, yyyy, h:mm a";

/**
 * Renders an invitation's time range for a viewer in `timeZone`.
 *
 * `start` and `end` come from the parser as either an absolute instant
 * ("2026-09-29T16:00:00.000Z"), a floating wall-clock time
 * ("2026-09-29T13:00:00"), or a plain date for all-day events.
 */
export function formatInvitationTime(
  {
    start,
    end,
    allDay,
  }: { start: string; end: string | null; allDay: boolean },
  timeZone: string,
) {
  const startDate = toViewerDate(start, timeZone);
  const endDate = end ? toViewerDate(end, timeZone) : null;

  if (allDay) {
    // DTEND is exclusive for all-day events, so it names the morning after.
    const lastDay = endDate ? subDays(endDate, 1) : startDate;
    if (lastDay.getTime() <= startDate.getTime()) return format(startDate, DAY);
    return `${format(startDate, DAY)} – ${format(lastDay, DAY)}`;
  }

  if (!endDate) return `${format(startDate, DAY)} · ${format(startDate, TIME)}`;
  if (isSameDay(startDate, endDate))
    return `${format(startDate, DAY)} · ${format(startDate, TIME)} – ${format(endDate, TIME)}`;
  return `${format(startDate, DAY_AND_TIME)} – ${format(endDate, DAY_AND_TIME)}`;
}

function toViewerDate(value: string, timeZone: string) {
  // A floating time or plain date carries no zone, so its wall clock is what
  // every viewer should read; parseISO leaves those components untouched.
  if (!value.endsWith("Z")) return parseISO(value);
  return new TZDate(new Date(value), timeZone);
}
