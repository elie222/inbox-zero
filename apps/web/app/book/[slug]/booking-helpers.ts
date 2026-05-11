import { addMinutes } from "date-fns";

export type HourFormat = "12h" | "24h";
export type Slot = { endTime: string; startTime: string };

export function formatShortWeekdayName(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function getInitialVisibleMonthDate(
  slotParam: string | null,
  now = new Date(),
) {
  const slotDate = slotParam ? new Date(slotParam) : null;
  return startOfMonth(isValidDate(slotDate) ? slotDate : now);
}

export function parseSlotParam(
  value: string | null,
  durationMinutes: number | undefined,
): Slot | null {
  if (!value || !durationMinutes) return null;
  const startTime = new Date(value);
  if (Number.isNaN(startTime.getTime())) return null;

  return {
    startTime: startTime.toISOString(),
    endTime: addMinutes(startTime, durationMinutes).toISOString(),
  };
}

export function normalizeTimezone(
  timezone: string | null | undefined,
  fallback: string,
) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone || fallback });
    return timezone || fallback;
  } catch {
    return fallback;
  }
}

export function formatDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dateKeyToLocalDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isBeforeToday(date: Date, todayKey: string, timezone: string) {
  return formatDateKey(date, timezone) < todayKey;
}

export function groupSlotsByDay(slots: Slot[], timezone: string) {
  const map = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = formatDateKey(new Date(slot.startTime), timezone);
    const list = map.get(key) ?? [];
    list.push(slot);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return map;
}

export function formatSelectedDateHeading(key: string) {
  // The key already encodes the calendar date the guest picked. Format it as
  // UTC so the heading isn't shifted by far-east/far-west zones (e.g.,
  // Pacific/Kiritimati at UTC+14 would otherwise roll noon UTC into the next
  // local day).
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatSlotTime(
  value: string,
  timezone: string,
  hourFormat: HourFormat,
) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    hour12: hourFormat === "12h",
  }).format(new Date(value));
}

export function detectDefaultHourFormat(): HourFormat {
  return Intl.DateTimeFormat().resolvedOptions().hour12 === false
    ? "24h"
    : "12h";
}

export function formatLongDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function getApiError(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return "Something went wrong";
}

function isValidDate(date: Date | null): date is Date {
  return Boolean(date && !Number.isNaN(date.getTime()));
}
