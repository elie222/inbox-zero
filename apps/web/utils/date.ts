export const ONE_MINUTE_MS = 1000 * 60;
export const ONE_HOUR_MS = ONE_MINUTE_MS * 60;
export const ONE_DAY_MS = ONE_HOUR_MS * 24;
export const ONE_MONTH_MS = ONE_DAY_MS * 30;
export const ONE_YEAR_MS = ONE_DAY_MS * 365;

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
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const date = new Date(+internalDate);
  if (Number.isNaN(date.getTime())) return new Date();

  return date;
}
