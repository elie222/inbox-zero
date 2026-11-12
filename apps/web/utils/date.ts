import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { format } from "date-fns/format";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { isSameDay } from "date-fns/isSameDay";
import { isSameMonth } from "date-fns/isSameMonth";
import { isSameYear } from "date-fns/isSameYear";
import { isWeekend } from "date-fns/isWeekend";
import { startOfDay } from "date-fns/startOfDay";
import { subDays } from "date-fns/subDays";
import { TZDate } from "@date-fns/tz";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";

export const ONE_MINUTE_MS = 1000 * 60;
export const ONE_HOUR_MS = ONE_MINUTE_MS * 60;
export const ONE_DAY_MS = ONE_HOUR_MS * 24;
export const ONE_MONTH_MS = ONE_DAY_MS * 30;
export const ONE_YEAR_MS = ONE_DAY_MS * 365;
export const TEN_YEARS_MS = ONE_YEAR_MS * 10;

export const ONE_HOUR_MINUTES = 60;
export const ONE_DAY_MINUTES = ONE_HOUR_MINUTES * 24;
export const ONE_WEEK_MINUTES = ONE_DAY_MINUTES * 7;
export const NINETY_DAYS_MINUTES = ONE_DAY_MINUTES * 90;

/**
 * Formats a date into a short string.
 * - If the date is today, returns the time (e.g., "3:44 PM").
 * - If the date is this year, returns the date (e.g., "JUL 5").
 * - Otherwise includes the year (e.g., "JUL 5, 2024").
 * - Optionally returns the date part in lowercase (e.g., "jul 5").
 * - Uses the runtime locale unless `locale` is given (pass the UI locale).
 */
export function formatShortDate(
  date: Date,
  options: { lowercase?: boolean; locale?: string } = {},
) {
  const now = new Date();

  if (isSameDay(date, now))
    return shortDateFormatter("time", options.locale).format(date);

  const formattedDate = shortDateFormatter(
    isSameYear(date, now) ? "date" : "dateWithYear",
    options.locale,
  ).format(date);

  return options.lowercase ? formattedDate : formattedDate.toUpperCase();
}

/**
 * Labels a date for grouping an email list into sections. The sections are
 * deliberately coarse so a list only ever carries a handful of headings.
 * - Today and yesterday get their own sections.
 * - The rest of the past week is one "Last 7 days" section.
 * - Older days in the current month are one "Earlier this month" section.
 * - Earlier dates are labelled by month (e.g. "August", or "August 2024").
 * - A date ahead of today keeps its own day, so a sender with a skewed clock
 *   is never filed under a section that has already passed.
 */
export function formatDateGroupLabel(
  date: Date,
  i18n: I18n,
  now: Date = new Date(),
) {
  if (isSameDay(date, now)) return i18n._(msg`Today`);
  if (isSameDay(date, subDays(now, 1))) return i18n._(msg`Yesterday`);
  if (date > now)
    return formatGroupDate(date, i18n, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  if (date >= startOfDay(subDays(now, 6))) return i18n._(msg`Last 7 days`);
  if (isSameMonth(date, now)) return i18n._(msg`Earlier this month`);
  if (isSameYear(date, now))
    return formatGroupDate(date, i18n, { month: "long" });
  return formatGroupDate(date, i18n, { month: "long", year: "numeric" });
}

export function dateToSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export function internalDateToDate(
  internalDate?: string | null,
  options?: { fallbackToNow?: boolean },
): Date {
  const fallbackToNow = options?.fallbackToNow ?? true;
  if (!internalDate?.trim()) {
    return fallbackToNow ? new Date() : new Date(Number.NaN);
  }

  // First try to parse as a regular date string (for ISO strings like "2025-06-19T21:46:31Z")
  let date = new Date(internalDate);
  if (!Number.isNaN(date.getTime())) return date;

  // Fallback to the old behavior for numeric timestamps
  date = new Date(+internalDate);
  if (Number.isNaN(date.getTime())) {
    return fallbackToNow ? new Date() : new Date(Number.NaN);
  }

  return date;
}

export function formatDateForLLM(date: Date) {
  return format(date, "EEEE, yyyy-MM-dd HH:mm:ss 'UTC'");
}

export function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatRelativeTimeForLLM(date: Date) {
  return formatDistanceToNow(date, { addSuffix: true });
}

// Format: Mar 18, 2025
export function formatDateSimple(date: Date, locale = "en-US") {
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Comparator function for sorting messages by internalDate
 * @param direction - 'asc' for oldest first (default, chronological), 'desc' for newest first
 */
export function sortByInternalDate<T extends { internalDate?: string | null }>(
  direction: "asc" | "desc" = "asc",
) {
  return (a: T, b: T): number => {
    const aTime = a.internalDate
      ? internalDateToDate(a.internalDate).getTime()
      : 0;
    const bTime = b.internalDate
      ? internalDateToDate(b.internalDate).getTime()
      : 0;
    return direction === "asc" ? aTime - bTime : bTime - aTime;
  };
}

const DEFAULT_TIMEZONE = "UTC";
const logger = createScopedLogger("date-utils");

/**
 * Formats a date/time in the user's timezone.
 * Falls back to UTC if the timezone is invalid (corrupted/legacy/non-IANA values).
 * @param date - The date to format (typically from a calendar event)
 * @param timezone - The user's timezone (e.g., "America/Sao_Paulo", "America/New_York")
 * @param formatString - The date-fns format string (e.g., "h:mm a", "MMM d, yyyy 'at' h:mm a")
 * @returns The formatted date string in the user's timezone
 */
export function formatInUserTimezone(
  date: Date,
  timezone: string | null | undefined,
  formatString: string,
): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  try {
    const dateInTZ = new TZDate(date, tz);
    return format(dateInTZ, formatString);
  } catch (error) {
    // Invalid timezone (corrupted/legacy/non-IANA) - log and fall back to UTC
    logger.error("Invalid timezone, falling back to UTC", {
      timezone: tz,
      error,
    });
    captureException(error, {
      extra: { timezone: tz, context: "formatInUserTimezone" },
    });
    const dateInUTC = new TZDate(date, DEFAULT_TIMEZONE);
    return format(dateInUTC, formatString);
  }
}

/**
 * Formats a time (without date) in the user's timezone.
 * Example output: "4:00 PM"
 */
export function formatTimeInUserTimezone(
  date: Date,
  timezone: string | null | undefined,
): string {
  return formatInUserTimezone(date, timezone, "h:mm a");
}

/**
 * Formats a date and time in the user's timezone.
 * Example output: "Dec 30, 2024 at 4:00 PM"
 */
export function formatDateTimeInUserTimezone(
  date: Date,
  timezone: string | null | undefined,
): string {
  return formatInUserTimezone(date, timezone, "MMM d, yyyy 'at' h:mm a");
}

export function hasElapsedBusinessDays({
  start,
  end,
  days,
  windowMinutes = 0,
  timezone,
}: {
  start: Date;
  end: Date;
  days: number;
  windowMinutes?: number;
  timezone: string | null | undefined;
}) {
  const elapsedMs = getBusinessElapsedMs(start, end, timezone);
  const thresholdWithWindowMs =
    days * ONE_DAY_MS - windowMinutes * ONE_MINUTE_MS;
  return elapsedMs > thresholdWithWindowMs;
}

export function getElapsedBusinessDaysForDisplay({
  start,
  end,
  timezone,
}: {
  start: Date;
  end: Date;
  timezone: string | null | undefined;
}) {
  const elapsedMs = getBusinessElapsedMs(start, end, timezone);
  return Math.max(1, Math.ceil(elapsedMs / ONE_DAY_MS));
}

function getBusinessElapsedMs(
  start: Date,
  end: Date,
  timezone: string | null | undefined,
) {
  if (end <= start) return 0;

  const safeTimezone = getSafeTimezone(timezone);
  let cursor = start;
  let elapsedMs = 0;

  while (cursor < end) {
    const nextBoundary = getNextZonedMidnight(cursor, safeTimezone);
    const segmentEnd = nextBoundary < end ? nextBoundary : end;

    if (!isWeekend(new TZDate(cursor, safeTimezone))) {
      elapsedMs += segmentEnd.getTime() - cursor.getTime();
    }

    if (segmentEnd <= cursor) break;
    cursor = segmentEnd;
  }

  return elapsedMs;
}

function getSafeTimezone(timezone: string | null | undefined) {
  if (!timezone) return DEFAULT_TIMEZONE;

  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getNextZonedMidnight(date: Date, timezone: string) {
  const zonedDate = new TZDate(date, timezone);
  return new TZDate(
    zonedDate.getFullYear(),
    zonedDate.getMonth(),
    zonedDate.getDate() + 1,
    0,
    0,
    0,
    0,
    timezone,
  );
}

const shortDateFormats = {
  // Numeric hours avoid leading zeros (3:44 PM, not 03:44 PM).
  time: { hour: "numeric", minute: "2-digit" },
  date: { month: "short", day: "numeric" },
  dateWithYear: { month: "short", day: "numeric", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
// Mail lists format a date per row on every render, and building an Intl
// formatter each time dominated that cost.
const shortDateFormatters = new Map<string, Intl.DateTimeFormat>();

function shortDateFormatter(
  kind: keyof typeof shortDateFormats,
  locale: string | undefined,
) {
  const key = `${locale ?? ""}:${kind}`;
  let formatter = shortDateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, shortDateFormats[kind]);
    shortDateFormatters.set(key, formatter);
  }
  return formatter;
}

// Some locales write month names in lowercase, which reads oddly as a heading.
function formatGroupDate(
  date: Date,
  i18n: I18n,
  options: Intl.DateTimeFormatOptions,
) {
  const text = i18n.date(date, options);
  return text.charAt(0).toLocaleUpperCase(i18n.locale) + text.slice(1);
}
