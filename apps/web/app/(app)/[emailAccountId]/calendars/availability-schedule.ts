export type AvailabilityWindowInput = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

export type Range = { start: string; end: string };
export type DayState = { enabled: boolean; ranges: Range[] };

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Monday to Friday, 9:00 to 17:00. Mirrors the default schedule created
// alongside a booking link so the standalone editor feels usable immediately.
export const DEFAULT_WEEKDAY_WINDOWS: AvailabilityWindowInput[] = [
  1, 2, 3, 4, 5,
].map((weekday) => ({
  weekday,
  startMinutes: 9 * 60,
  endMinutes: 17 * 60,
}));

export function buildDayState(windows: AvailabilityWindowInput[]): DayState[] {
  const byDay = new Map<number, Range[]>();
  for (const window of windows) {
    const list = byDay.get(window.weekday) ?? [];
    list.push({
      start: minutesToTime(window.startMinutes),
      end: minutesToTime(window.endMinutes),
    });
    byDay.set(window.weekday, list);
  }
  return DAY_LABELS.map((_, weekday) => {
    const ranges = byDay.get(weekday) ?? [];
    return ranges.length
      ? { enabled: true, ranges }
      : { enabled: false, ranges: [] };
  });
}

export function collectWindows(
  days: DayState[],
):
  | { windows: AvailabilityWindowInput[]; error: null }
  | { windows: null; error: string } {
  const windows: AvailabilityWindowInput[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const day = days[weekday];
    if (!day.enabled) continue;
    const dayWindows: AvailabilityWindowInput[] = [];
    for (const range of day.ranges) {
      const start = parseTime(range.start);
      const end = parseTime(range.end);
      if (start === null || end === null || end <= start) {
        return {
          windows: null,
          error: `${DAY_LABELS[weekday]}: end time must be after start time.`,
        };
      }
      dayWindows.push({ weekday, startMinutes: start, endMinutes: end });
    }
    dayWindows.sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < dayWindows.length; i++) {
      if (dayWindows[i].startMinutes < dayWindows[i - 1].endMinutes) {
        return {
          windows: null,
          error: `${DAY_LABELS[weekday]}: time ranges overlap.`,
        };
      }
    }
    windows.push(...dayWindows);
  }

  if (windows.length === 0) {
    return { windows: null, error: "Add at least one available time range." };
  }

  return { windows, error: null };
}

export function nextRangeAfter(previous?: Range): Range {
  if (!previous) return { start: "09:00", end: "17:00" };
  const previousEnd = parseTime(previous.end) ?? 17 * 60;
  const start = Math.min(previousEnd + 30, 23 * 60);
  const end = Math.min(start + 60, 24 * 60 - 1);
  return { start: minutesToTime(start), end: minutesToTime(end) };
}

export function parseTime(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
