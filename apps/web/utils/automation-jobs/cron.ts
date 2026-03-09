import { addMinutes } from "date-fns";

const CRON_PART_COUNT = 5;
const MAX_SEARCH_MINUTES = 60 * 24 * 366;

type ParsedAutomationCron = {
  minutes: Set<number> | null;
  hours: Set<number> | null;
  weekdays: Set<number> | null;
};

export function validateAutomationCronExpression(cronExpression: string) {
  parseAutomationCronExpression(cronExpression);
}

export function getNextAutomationJobRunAt({
  cronExpression,
  fromDate,
}: {
  cronExpression: string;
  fromDate: Date;
}): Date {
  const parsed = parseAutomationCronExpression(cronExpression);

  const candidate = new Date(fromDate);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_SEARCH_MINUTES; i++) {
    if (matchesCronAtUtc(parsed, candidate)) {
      return candidate;
    }

    const nextMinute = addMinutes(candidate, 1);
    candidate.setTime(nextMinute.getTime());
  }

  throw new Error(
    `Could not find next run within ${MAX_SEARCH_MINUTES} minutes for cron: ${cronExpression}`,
  );
}

function parseAutomationCronExpression(
  cronExpression: string,
): ParsedAutomationCron {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== CRON_PART_COUNT) {
    throw new Error(
      `Invalid cron expression: expected ${CRON_PART_COUNT} fields, got ${parts.length}`,
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (dayOfMonth !== "*" || month !== "*") {
    throw new Error(
      "Automation cron supports wildcard day-of-month and month only",
    );
  }

  return {
    minutes: parseCronField({
      field: minute,
      min: 0,
      max: 59,
      label: "minute",
      normalize: identity,
    }),
    hours: parseCronField({
      field: hour,
      min: 0,
      max: 23,
      label: "hour",
      normalize: identity,
    }),
    weekdays: parseCronField({
      field: dayOfWeek,
      min: 0,
      max: 7,
      label: "day-of-week",
      normalize: normalizeDayOfWeek,
    }),
  };
}

function matchesCronAtUtc(parsed: ParsedAutomationCron, date: Date) {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const weekday = date.getUTCDay();

  const minuteMatches = !parsed.minutes || parsed.minutes.has(minute);
  const hourMatches = !parsed.hours || parsed.hours.has(hour);
  const weekdayMatches = !parsed.weekdays || parsed.weekdays.has(weekday);

  return minuteMatches && hourMatches && weekdayMatches;
}

function parseCronField({
  field,
  min,
  max,
  label,
  normalize,
}: {
  field: string;
  min: number;
  max: number;
  label: string;
  normalize: (value: number) => number;
}): Set<number> | null {
  if (field === "*") return null;

  const values = new Set<number>();
  const segments = field.split(",");

  for (const segment of segments) {
    const token = segment.trim();
    if (!token) {
      throw new Error(`Invalid empty segment in ${label} field`);
    }

    const stepParts = token.split("/");
    if (stepParts.length > 2) {
      throw new Error(
        `Invalid ${label} token ${token}: too many step delimiters`,
      );
    }

    const [rangeToken, stepToken] = stepParts;
    const step = stepToken ? parseStep(stepToken, label) : 1;

    const [rangeStart, rangeEnd] = parseRangeToken({
      token: rangeToken,
      min,
      max,
      label,
    });

    for (let value = rangeStart; value <= rangeEnd; value += step) {
      const normalized = normalize(value);

      if (normalized < min || normalized > max) {
        throw new Error(
          `Invalid value ${normalized} in ${label} field. Expected ${min}-${max}`,
        );
      }

      values.add(normalized);
    }
  }

  if (!values.size) {
    throw new Error(`No values resolved for ${label} field`);
  }

  return values;
}

function parseRangeToken({
  token,
  min,
  max,
  label,
}: {
  token: string;
  min: number;
  max: number;
  label: string;
}): [number, number] {
  if (token === "*") return [min, max];

  if (token.includes("-")) {
    const rangeParts = token.split("-");
    if (rangeParts.length !== 2) {
      throw new Error(
        `Invalid ${label} token ${token}: too many range delimiters`,
      );
    }

    const [startToken, endToken] = rangeParts;
    const start = parsePositiveInt(startToken, `${label} range start`);
    const end = parsePositiveInt(endToken, `${label} range end`);

    if (start > end) {
      throw new Error(`Invalid ${label} range ${token}: start must be <= end`);
    }

    if (start < min || end > max) {
      throw new Error(
        `Invalid ${label} range ${token}: expected ${min}-${max}`,
      );
    }

    return [start, end];
  }

  const value = parsePositiveInt(token, label);

  if (value < min || value > max) {
    throw new Error(`Invalid ${label} value ${value}: expected ${min}-${max}`);
  }

  return [value, value];
}

function parsePositiveInt(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  if (parsed <= 0 && value !== "0") {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function parseStep(value: string, label: string) {
  const step = parsePositiveInt(value, `${label} step`);
  if (step <= 0) throw new Error(`Invalid ${label} step: ${value}`);
  return step;
}

function normalizeDayOfWeek(value: number) {
  return value === 7 ? 0 : value;
}

function identity(value: number) {
  return value;
}
