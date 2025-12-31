import { format } from "date-fns/format";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { TZDate } from "@date-fns/tz";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";

export const ONE_MINUTE_MS = 1000 * 60;
export const ONE_HOUR_MS = ONE_MINUTE_MS * 60;
export const ONE_DAY_MS = ONE_HOUR_MS * 24;
export const ONE_MONTH_MS = ONE_DAY_MS * 30;
export const ONE_YEAR_MS = ONE_DAY_MS * 365;

export const ONE_HOUR_MINUTES = 60;
export const ONE_DAY_MINUTES = ONE_HOUR_MINUTES * 24;
export const ONE_WEEK_MINUTES = ONE_DAY_MINUTES * 7;
export const NINETY_DAYS_MINUTES = ONE_DAY_MINUTES * 90;

/**
 * Formats a date into a short string.
 * - If the date is today, returns the time (e.g., "3:44 PM").
 * - If the date is not today, returns the date (e.g., "JUL 5" or "AUG 13").
 * - Optionally includes the year (e.g., "JUL 5, 2024").
 * - Optionally returns the date part in lowercase (e.g., "jul 5").
 */
export function formatShortDate(
  date: Date,
  options: {
    includeYear?: boolean;
    lowercase?: boolean;
  } = {
    includeYear: false,
    lowercase: false,
  },
) {
  // if date is today, return the time. e.g. 12:30pm
  // if date is before today then return the date. eg JUL 5th or AUG 13th

  const today = new Date();

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) {
    // Use hour: 'numeric' to avoid leading zeros (e.g., 3:44 PM instead of 03:44 PM)
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const formattedDate = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: options.includeYear ? "numeric" : undefined,
  });

  return options.lowercase ? formattedDate : formattedDate.toUpperCase();
}

export function dateToSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export function internalDateToDate(internalDate?: string | null): Date {
  if (!internalDate) return new Date();

  // First try to parse as a regular date string (for ISO strings like "2025-06-19T21:46:31Z")
  let date = new Date(internalDate);
  if (!Number.isNaN(date.getTime())) return date;

  // Fallback to the old behavior for numeric timestamps
  date = new Date(+internalDate);
  if (Number.isNaN(date.getTime())) return new Date();

  return date;
}

export function formatDateForLLM(date: Date) {
  return format(date, "EEEE, yyyy-MM-dd HH:mm:ss 'UTC'");
}

export function formatRelativeTimeForLLM(date: Date) {
  return formatDistanceToNow(date, { addSuffix: true });
}

// Format: Mar 18, 2025
export function formatDateSimple(date: Date) {
  return date.toLocaleDateString("en-US", {
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
