/**
 * Plugin runtime constants.
 */

/**
 * Inbox Zero version for plugin compatibility checking.
 * Update this when releasing new versions that affect plugin API compatibility.
 */
export const INBOX_ZERO_VERSION = "0.14.0";

/** Minimum allowed cron interval in minutes. Protects system resources. */
export const CRON_MIN_INTERVAL_MINUTES = 1;

/** Minimum allowed cron interval in milliseconds */
export const CRON_MIN_INTERVAL_MS = CRON_MIN_INTERVAL_MINUTES * 60 * 1000;

/** Maximum number of schedules per plugin */
export const MAX_SCHEDULES_PER_PLUGIN = 10;

/** Maximum number of triggers per plugin */
export const MAX_TRIGGERS_PER_PLUGIN = 20;

/** Default timezone for schedules when not specified */
export const DEFAULT_TIMEZONE = "UTC";

/** Maximum cron expression length to prevent abuse */
export const MAX_CRON_EXPRESSION_LENGTH = 100;
