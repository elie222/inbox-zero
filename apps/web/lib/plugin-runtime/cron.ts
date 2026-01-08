/**
 * Simplified cron syntax parser and validator.
 * Supports both simplified syntax (@every, @daily, etc.) and standard 5-field cron expressions.
 */

import {
  CRON_MIN_INTERVAL_MINUTES,
  MAX_CRON_EXPRESSION_LENGTH,
} from "./constants";

type SimplifiedCron =
  | `@every ${number}m`
  | `@every ${number}h`
  | "@daily"
  | "@weekly"
  | "@hourly"
  | string;

interface CronValidationResult {
  valid: boolean;
  normalized: string;
  effectiveIntervalMinutes: number;
  warning?: string;
  error?: string;
}

const SIMPLIFIED_PATTERNS = {
  everyMinutes: /^@every\s+(\d+)m$/,
  everyHours: /^@every\s+(\d+)h$/,
  daily: /^@daily$/,
  weekly: /^@weekly$/,
  hourly: /^@hourly$/,
} as const;

const CRON_FIELD_RANGES = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 7 }, // 0 and 7 both represent Sunday
} as const;

/**
 * Checks if a string is a simplified cron expression (starts with @).
 */
function isSimplifiedCron(cron: string): boolean {
  return cron.trim().startsWith("@");
}

/**
 * Converts simplified cron syntax to standard 5-field cron expression.
 *
 * @param simplified - Simplified cron expression (e.g., '@every 5m', '@daily')
 * @returns Standard 5-field cron expression
 * @throws Error if the simplified expression is invalid or unrecognized
 */
export function parseSimplifiedCron(simplified: SimplifiedCron): string {
  const trimmed = simplified.trim().toLowerCase();

  // only process @ prefixed expressions
  if (!trimmed.startsWith("@")) {
    return simplified;
  }

  // @every Nm -> */N * * * *
  const everyMinutesMatch = trimmed.match(SIMPLIFIED_PATTERNS.everyMinutes);
  if (everyMinutesMatch) {
    const minutes = Number.parseInt(everyMinutesMatch[1], 10);
    if (minutes <= 0) {
      throw new Error("Minute interval must be greater than 0");
    }
    if (minutes > 59) {
      throw new Error(
        "Minute interval cannot exceed 59, use hours for longer intervals",
      );
    }
    return `*/${minutes} * * * *`;
  }

  // @every Nh -> 0 */N * * *
  const everyHoursMatch = trimmed.match(SIMPLIFIED_PATTERNS.everyHours);
  if (everyHoursMatch) {
    const hours = Number.parseInt(everyHoursMatch[1], 10);
    if (hours <= 0) {
      throw new Error("Hour interval must be greater than 0");
    }
    if (hours > 23) {
      throw new Error("Hour interval cannot exceed 23");
    }
    return `0 */${hours} * * *`;
  }

  // @daily -> 0 0 * * *
  if (SIMPLIFIED_PATTERNS.daily.test(trimmed)) {
    return "0 0 * * *";
  }

  // @weekly -> 0 0 * * 0
  if (SIMPLIFIED_PATTERNS.weekly.test(trimmed)) {
    return "0 0 * * 0";
  }

  // @hourly -> 0 * * * *
  if (SIMPLIFIED_PATTERNS.hourly.test(trimmed)) {
    return "0 * * * *";
  }

  // unrecognized @ expression
  throw new Error(
    `Unknown simplified cron syntax: ${simplified}. Supported: @every Nm, @every Nh, @daily, @weekly, @hourly`,
  );
}

/**
 * Validates a single cron field value or pattern.
 */
function validateCronField(
  field: string,
  range: { min: number; max: number },
  fieldName: string,
): string | null {
  // wildcard
  if (field === "*") {
    return null;
  }

  // step pattern (*/n or n/m)
  if (field.includes("/")) {
    const [base, step] = field.split("/");
    const stepNum = Number.parseInt(step, 10);
    if (Number.isNaN(stepNum) || stepNum <= 0) {
      return `Invalid step value in ${fieldName}: ${step}`;
    }
    if (base !== "*") {
      const baseNum = Number.parseInt(base, 10);
      if (Number.isNaN(baseNum) || baseNum < range.min || baseNum > range.max) {
        return `Invalid base value in ${fieldName}: ${base}`;
      }
    }
    return null;
  }

  // range pattern (n-m)
  if (field.includes("-")) {
    const [start, end] = field.split("-").map((n) => Number.parseInt(n, 10));
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return `Invalid range in ${fieldName}: ${field}`;
    }
    if (
      start < range.min ||
      start > range.max ||
      end < range.min ||
      end > range.max
    ) {
      return `Range values out of bounds in ${fieldName}: ${field}`;
    }
    if (start > end) {
      return `Invalid range in ${fieldName}: start (${start}) > end (${end})`;
    }
    return null;
  }

  // list pattern (n,m,o)
  if (field.includes(",")) {
    const values = field.split(",");
    for (const value of values) {
      const error = validateCronField(value.trim(), range, fieldName);
      if (error) {
        return error;
      }
    }
    return null;
  }

  // single value
  const num = Number.parseInt(field, 10);
  if (Number.isNaN(num) || num < range.min || num > range.max) {
    return `Invalid value in ${fieldName}: ${field} (must be ${range.min}-${range.max})`;
  }

  return null;
}

/**
 * Validates a standard 5-field cron expression.
 *
 * @param cron - Standard 5-field cron expression
 * @returns True if valid, false otherwise
 */
export function isValidCronExpression(cron: string): boolean {
  if (!cron || typeof cron !== "string") {
    return false;
  }

  if (cron.length > MAX_CRON_EXPRESSION_LENGTH) {
    return false;
  }

  const trimmed = cron.trim();

  // check for simplified syntax
  if (isSimplifiedCron(trimmed)) {
    try {
      parseSimplifiedCron(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  const errors = [
    validateCronField(minute, CRON_FIELD_RANGES.minute, "minute"),
    validateCronField(hour, CRON_FIELD_RANGES.hour, "hour"),
    validateCronField(dayOfMonth, CRON_FIELD_RANGES.dayOfMonth, "day of month"),
    validateCronField(month, CRON_FIELD_RANGES.month, "month"),
    validateCronField(dayOfWeek, CRON_FIELD_RANGES.dayOfWeek, "day of week"),
  ];

  return errors.every((error) => error === null);
}

/**
 * Estimates the effective interval in minutes for a cron expression.
 * This is an approximation for scheduling purposes.
 */
export function getCronIntervalMinutes(cron: string): number {
  const trimmed = cron.trim();
  let normalized = trimmed;

  // convert simplified syntax first
  if (isSimplifiedCron(trimmed)) {
    try {
      normalized = parseSimplifiedCron(trimmed);
    } catch {
      return 0;
    }
  }

  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    return 0;
  }

  const [minute, hour, dayOfMonth, , dayOfWeek] = fields;

  // */N * * * * -> every N minutes
  if (
    minute.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    dayOfWeek === "*"
  ) {
    const interval = Number.parseInt(minute.slice(2), 10);
    return Number.isNaN(interval) ? 0 : interval;
  }

  // 0 */N * * * -> every N hours
  if (
    minute === "0" &&
    hour.startsWith("*/") &&
    dayOfMonth === "*" &&
    dayOfWeek === "*"
  ) {
    const interval = Number.parseInt(hour.slice(2), 10);
    return Number.isNaN(interval) ? 0 : interval * 60;
  }

  // 0 * * * * -> hourly
  if (
    minute === "0" &&
    hour === "*" &&
    dayOfMonth === "*" &&
    dayOfWeek === "*"
  ) {
    return 60;
  }

  // 0 0 * * * -> daily
  if (
    minute === "0" &&
    hour === "0" &&
    dayOfMonth === "*" &&
    dayOfWeek === "*"
  ) {
    return 24 * 60;
  }

  // 0 0 * * 0 -> weekly
  if (
    minute === "0" &&
    hour === "0" &&
    dayOfMonth === "*" &&
    dayOfWeek === "0"
  ) {
    return 7 * 24 * 60;
  }

  // specific hour each day (e.g., 0 7 * * *)
  if (
    !minute.includes("*") &&
    !hour.includes("*") &&
    dayOfMonth === "*" &&
    dayOfWeek === "*"
  ) {
    return 24 * 60;
  }

  // specific time on specific day of week
  if (
    !minute.includes("*") &&
    !hour.includes("*") &&
    dayOfMonth === "*" &&
    dayOfWeek !== "*"
  ) {
    return 7 * 24 * 60;
  }

  // default: assume daily for complex expressions
  return 24 * 60;
}

/**
 * Rounds a minute interval up to the minimum allowed interval.
 */
export function roundToMinInterval(minutes: number): number {
  if (minutes < CRON_MIN_INTERVAL_MINUTES) {
    return CRON_MIN_INTERVAL_MINUTES;
  }
  return minutes;
}

/**
 * Validates and normalizes a cron expression.
 * Handles simplified syntax conversion and minimum interval enforcement.
 */
export function validateAndNormalizeCron(cron: string): CronValidationResult {
  if (!cron || typeof cron !== "string") {
    return {
      valid: false,
      normalized: "",
      effectiveIntervalMinutes: 0,
      error: "Cron expression is required",
    };
  }

  const trimmed = cron.trim();

  if (trimmed.length > MAX_CRON_EXPRESSION_LENGTH) {
    return {
      valid: false,
      normalized: "",
      effectiveIntervalMinutes: 0,
      error: `Cron expression exceeds maximum length of ${MAX_CRON_EXPRESSION_LENGTH} characters`,
    };
  }

  let normalized: string;
  let warning: string | undefined;

  // convert simplified syntax
  if (isSimplifiedCron(trimmed)) {
    try {
      normalized = parseSimplifiedCron(trimmed);
    } catch (err) {
      return {
        valid: false,
        normalized: "",
        effectiveIntervalMinutes: 0,
        error:
          err instanceof Error ? err.message : "Invalid simplified cron syntax",
      };
    }
  } else {
    normalized = trimmed;
  }

  // validate the normalized expression
  if (!isValidCronExpression(normalized)) {
    return {
      valid: false,
      normalized: "",
      effectiveIntervalMinutes: 0,
      error:
        "Invalid cron expression format. Expected 5 fields: minute hour day-of-month month day-of-week",
    };
  }

  // check interval
  const intervalMinutes = getCronIntervalMinutes(normalized);

  if (intervalMinutes < CRON_MIN_INTERVAL_MINUTES && intervalMinutes > 0) {
    // adjust the expression to meet minimum interval
    const rounded = roundToMinInterval(intervalMinutes);
    const fields = normalized.split(/\s+/);

    if (fields[0].startsWith("*/")) {
      fields[0] = `*/${rounded}`;
      normalized = fields.join(" ");
      warning = `Interval adjusted from ${intervalMinutes} to ${rounded} minutes (minimum allowed)`;
    }
  }

  return {
    valid: true,
    normalized,
    effectiveIntervalMinutes: getCronIntervalMinutes(normalized),
    warning,
  };
}
