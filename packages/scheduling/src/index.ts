import { addMilliseconds, addMinutes as addDateFnsMinutes } from "date-fns";

type DateInput = Date | string;

export type AvailabilityRule = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

export type DateOverride = {
  date: string;
  type: "BLOCKED";
};

export type BusyPeriod = {
  start: DateInput;
  end: DateInput;
};

export type BookableSlot = {
  startTime: string;
  endTime: string;
};

export type BookingPolicy = {
  durationMinutes: number;
  slotIntervalMinutes: number;
  minimumNoticeMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  bookingWindowDays: number;
};

export type SlotGenerationInput = {
  now: DateInput;
  timezone: string;
  start: DateInput;
  end: DateInput;
  rules: AvailabilityRule[];
  dateOverrides?: DateOverride[];
  busyPeriods?: BusyPeriod[];
  policy: BookingPolicy;
};

export type AvailabilityWindow = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ValidateSelectedSlotInput = SlotGenerationInput & {
  selectedStartTime: DateInput;
};

export type ValidateSelectedSlotResult =
  | { valid: true; slot: BookableSlot }
  | { valid: false; reason: string };

export function generateBookableSlots(
  input: SlotGenerationInput,
): BookableSlot[] {
  assertValidTimeZone(input.timezone);
  validatePolicy(input.policy);

  const now = parseDate(input.now, "now");
  const rangeStart = parseDate(input.start, "start");
  const rangeEnd = parseDate(input.end, "end");

  if (rangeEnd <= rangeStart) return [];

  const earliestStart = addMinutes(
    now,
    input.policy.minimumNoticeMinutes,
  ).getTime();
  const latestStart = addDays(now, input.policy.bookingWindowDays).getTime();
  const durationMs = minutesToMs(input.policy.durationMinutes);
  const intervalMs = minutesToMs(input.policy.slotIntervalMinutes);
  const windows = expandWeeklyAvailability(input);
  const busyPeriods = applyBuffers({
    busyPeriods: input.busyPeriods ?? [],
    bufferBeforeMinutes: input.policy.bufferBeforeMinutes,
    bufferAfterMinutes: input.policy.bufferAfterMinutes,
  });

  const slots: BookableSlot[] = [];

  for (const window of windows) {
    const windowStart = parseDate(window.startTime, "window.startTime");
    const windowEnd = parseDate(window.endTime, "window.endTime");
    const windowStartMs = windowStart.getTime();
    const rawFirst = Math.max(windowStartMs, rangeStart.getTime());
    const offsetMs = rawFirst - windowStartMs;
    const firstStart =
      windowStartMs + Math.ceil(offsetMs / intervalMs) * intervalMs;
    const lastEnd = Math.min(windowEnd.getTime(), rangeEnd.getTime());

    for (
      let slotStartMs = firstStart;
      slotStartMs + durationMs <= lastEnd;
      slotStartMs += intervalMs
    ) {
      if (slotStartMs < earliestStart || slotStartMs > latestStart) continue;

      const slotEndMs = slotStartMs + durationMs;
      slots.push({
        startTime: new Date(slotStartMs).toISOString(),
        endTime: new Date(slotEndMs).toISOString(),
      });
    }
  }

  return subtractBusyPeriods(dedupeAndSortSlots(slots), busyPeriods);
}

export function validateSelectedSlot(
  input: ValidateSelectedSlotInput,
): ValidateSelectedSlotResult {
  const selectedStart = parseDate(input.selectedStartTime, "selectedStartTime");
  const selectedEnd = addMinutes(selectedStart, input.policy.durationMinutes);

  if (!isAlignedToAvailabilityGrid({ ...input, selectedStart, selectedEnd })) {
    return { valid: false, reason: "Selected slot is not available" };
  }

  const slots = generateBookableSlots({
    ...input,
    start: selectedStart,
    end: selectedEnd,
  });
  const slot = slots.find(
    (candidate) =>
      parseDate(candidate.startTime, "slot.startTime").getTime() ===
      selectedStart.getTime(),
  );

  if (!slot) {
    return { valid: false, reason: "Selected slot is not available" };
  }

  return { valid: true, slot };
}

export function subtractBusyPeriods(
  slots: BookableSlot[],
  busyPeriods: BusyPeriod[],
): BookableSlot[] {
  if (!busyPeriods.length) return slots;

  const normalizedBusyPeriods = busyPeriods
    .map((period) => ({
      start: parseDate(period.start, "busy.start").getTime(),
      end: parseDate(period.end, "busy.end").getTime(),
    }))
    .filter((period) => period.end > period.start);

  return slots.filter((slot) => {
    const slotStart = parseDate(slot.startTime, "slot.startTime").getTime();
    const slotEnd = parseDate(slot.endTime, "slot.endTime").getTime();

    return !normalizedBusyPeriods.some(
      (busy) => slotStart < busy.end && slotEnd > busy.start,
    );
  });
}

export function expandWeeklyAvailability(
  input: Pick<
    SlotGenerationInput,
    "start" | "end" | "timezone" | "rules" | "dateOverrides"
  >,
): AvailabilityWindow[] {
  assertValidTimeZone(input.timezone);

  const rangeStart = parseDate(input.start, "start");
  const rangeEnd = parseDate(input.end, "end");
  if (rangeEnd <= rangeStart) return [];

  const blockedDates = new Set(
    (input.dateOverrides ?? [])
      .filter((override) => override.type === "BLOCKED")
      .map((override) => override.date),
  );
  const rulesByWeekday = new Map<number, AvailabilityRule[]>();

  for (const rule of input.rules) {
    validateRule(rule);
    const rules = rulesByWeekday.get(rule.weekday) ?? [];
    rules.push(rule);
    rulesByWeekday.set(rule.weekday, rules);
  }

  const windows: AvailabilityWindow[] = [];
  let date = getZonedDateKey(rangeStart, input.timezone);
  const endDate = getZonedDateKey(rangeEnd, input.timezone);

  while (compareDateKeys(date, endDate) <= 0) {
    if (!blockedDates.has(date)) {
      const weekday = getWeekdayFromDateKey(date);
      const rules = rulesByWeekday.get(weekday) ?? [];

      for (const rule of rules) {
        const startTime = zonedDateTimeToUtc(
          date,
          rule.startMinutes,
          input.timezone,
        );
        const endTime = zonedDateTimeToUtc(
          date,
          rule.endMinutes,
          input.timezone,
        );

        if (endTime > rangeStart && startTime < rangeEnd) {
          windows.push({
            date,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
          });
        }
      }
    }

    date = addDaysToDateKey(date, 1);
  }

  return windows.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function applyBuffers({
  busyPeriods,
  bufferBeforeMinutes,
  bufferAfterMinutes,
}: {
  busyPeriods: BusyPeriod[];
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}): BusyPeriod[] {
  return busyPeriods.map((period) => ({
    start: addMinutes(
      parseDate(period.start, "busy.start"),
      -bufferBeforeMinutes,
    ).toISOString(),
    end: addMinutes(
      parseDate(period.end, "busy.end"),
      bufferAfterMinutes,
    ).toISOString(),
  }));
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function getZonedDateKey(date: DateInput, timezone: string): string {
  const parts = getZonedParts(parseDate(date, "date"), timezone);
  return formatDateKey(parts.year, parts.month, parts.day);
}

function isAlignedToAvailabilityGrid({
  selectedStart,
  selectedEnd,
  timezone,
  rules,
  dateOverrides,
  policy,
}: Pick<
  ValidateSelectedSlotInput,
  "dateOverrides" | "policy" | "rules" | "timezone"
> & {
  selectedStart: Date;
  selectedEnd: Date;
}) {
  const intervalMs = minutesToMs(policy.slotIntervalMinutes);
  const selectedStartMs = selectedStart.getTime();
  const selectedEndMs = selectedEnd.getTime();
  const windows = expandWeeklyAvailability({
    start: selectedStart,
    end: selectedEnd,
    timezone,
    rules,
    dateOverrides,
  });

  return windows.some((window) => {
    const windowStartMs = parseDate(
      window.startTime,
      "window.startTime",
    ).getTime();
    const windowEndMs = parseDate(window.endTime, "window.endTime").getTime();

    return (
      selectedStartMs >= windowStartMs &&
      selectedEndMs <= windowEndMs &&
      (selectedStartMs - windowStartMs) % intervalMs === 0
    );
  });
}

function validatePolicy(policy: BookingPolicy) {
  const positiveFields: Array<keyof BookingPolicy> = [
    "durationMinutes",
    "slotIntervalMinutes",
    "bookingWindowDays",
  ];
  for (const field of positiveFields) {
    if (!Number.isInteger(policy[field]) || policy[field] <= 0) {
      throw new Error(`${field} must be a positive integer`);
    }
  }

  const nonNegativeFields: Array<keyof BookingPolicy> = [
    "minimumNoticeMinutes",
    "bufferBeforeMinutes",
    "bufferAfterMinutes",
  ];
  for (const field of nonNegativeFields) {
    if (!Number.isInteger(policy[field]) || policy[field] < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }
}

function validateRule(rule: AvailabilityRule) {
  if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
    throw new Error("weekday must be an integer from 0 to 6");
  }
  if (
    !Number.isInteger(rule.startMinutes) ||
    !Number.isInteger(rule.endMinutes) ||
    rule.startMinutes < 0 ||
    rule.endMinutes > 24 * 60 ||
    rule.endMinutes <= rule.startMinutes
  ) {
    throw new Error("availability rules must have valid start and end minutes");
  }
}

function assertValidTimeZone(timezone: string) {
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

function dedupeAndSortSlots(slots: BookableSlot[]) {
  const seen = new Set<string>();
  const deduped: BookableSlot[] = [];

  for (const slot of slots) {
    const key = `${slot.startTime}:${slot.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(slot);
  }

  return deduped.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function parseDate(value: DateInput, fieldName: string): Date {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return date;
}

function minutesToMs(minutes: number) {
  return minutes * 60 * 1000;
}

function addMinutes(date: Date, minutes: number) {
  return addDateFnsMinutes(date, minutes);
}

function addDays(date: Date, days: number) {
  return addMilliseconds(date, days * 24 * 60 * 60 * 1000);
}

function zonedDateTimeToUtc(
  dateKey: string,
  minutesAfterMidnight: number,
  timezone: string,
): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  const localTimeMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utcMs = localTimeMs;

  for (let i = 0; i < 3; i++) {
    utcMs = localTimeMs - getTimeZoneOffsetMs(new Date(utcMs), timezone);
  }

  return new Date(utcMs);
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone);
  const localAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return localAsUtcMs - date.getTime();
}

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date override: ${dateKey}`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function getWeekdayFromDateKey(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
