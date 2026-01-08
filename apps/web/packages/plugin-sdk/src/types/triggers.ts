/**
 * Trigger and schedule registration types for the Inbox Zero plugin SDK.
 *
 * These types enable plugins to register email triggers and scheduled tasks
 * that the host application will invoke when conditions are met.
 */

/**
 * Simplified email representation for plugin trigger matching.
 * Contains essential fields needed for trigger evaluation without exposing
 * internal implementation details.
 */
export interface EmailForPlugin {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  /** Plain text content of the email body */
  textPlain?: string;
  /** HTML content of the email body */
  textHtml?: string;
  /** Short snippet/preview of the email */
  snippet?: string;
  /** When the email was sent (ISO 8601 string) */
  date: string;
  /** Label IDs applied to the email */
  labelIds?: string[];
  /** Attachment metadata */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Configuration for registering an email trigger.
 *
 * Triggers can match emails using patterns or custom matcher functions.
 * Multiple matching criteria are combined with AND logic (all must match).
 */
export interface EmailTrigger {
  /**
   * Match emails sent to user+tag@domain.com format.
   * Only the tag portion should be specified (without the + prefix).
   *
   * Example: 'receipts' matches emails to user+receipts@domain.com
   */
  plusTag?: string;

  /**
   * Pattern to match against the sender's email address.
   * Supports glob patterns (*, ?) or regex strings.
   *
   * Examples:
   * - '*.amazon.com' matches emails from any amazon.com subdomain
   * - '/^no-reply@.*\\.com$/i' matches using regex
   */
  fromPattern?: string;

  /**
   * Pattern to match against the email subject line.
   * Supports glob patterns (*, ?) or regex strings.
   *
   * Examples:
   * - '*invoice*' matches subjects containing 'invoice'
   * - '/^Order #\\d+/' matches subjects starting with 'Order #' followed by digits
   */
  subjectPattern?: string;

  /**
   * Custom matcher function for complex trigger logic.
   * Return true if the email should trigger this handler.
   *
   * Note: Custom matchers are evaluated after pattern matchers.
   * If patterns are specified, the email must match all patterns
   * before the custom matcher is invoked.
   */
  matcher?: (email: EmailForPlugin) => boolean;

  /**
   * Optional human-readable description of what this trigger matches.
   * Useful for debugging and admin UIs.
   */
  description?: string;
}

/**
 * A registered trigger with its assigned ID and metadata.
 * Returned when listing registered triggers.
 */
export interface RegisteredTrigger {
  /** Unique identifier for this trigger registration */
  id: string;

  /** The plugin that registered this trigger */
  pluginId: string;

  /** The original trigger configuration */
  trigger: EmailTrigger;

  /** When the trigger was registered (ISO 8601 string) */
  registeredAt: string;

  /** Whether the trigger is currently active */
  enabled: boolean;

  /** Number of times this trigger has matched since registration */
  matchCount?: number;

  /** When this trigger last matched an email (ISO 8601 string) */
  lastMatchAt?: string;
}

/**
 * Configuration for registering a scheduled task.
 *
 * Schedules use cron expressions to define when tasks should run.
 */
export interface ScheduleConfig {
  /**
   * Human-readable name for the schedule.
   * Must be unique per plugin.
   *
   * Example: 'daily-summary'
   */
  name: string;

  /**
   * Cron expression defining when the task should run.
   * Uses standard 5-field cron format: minute hour day-of-month month day-of-week
   *
   * Examples:
   * - '0 7 * * *' runs daily at 7:00 AM
   * - '0 9 * * 1' runs every Monday at 9:00 AM
   * - '0 0 1 * *' runs at midnight on the first day of each month
   */
  cron: string;

  /**
   * IANA timezone identifier for schedule evaluation.
   * Defaults to UTC if not specified.
   *
   * Examples: 'America/New_York', 'Europe/London', 'Asia/Tokyo'
   */
  timezone?: string;

  /**
   * Optional data to pass to the scheduled handler when invoked.
   * This data will be included in the schedule event payload.
   */
  data?: Record<string, unknown>;

  /**
   * Optional human-readable description of what this schedule does.
   */
  description?: string;
}

/**
 * A registered schedule with its assigned ID and metadata.
 * Returned when listing registered schedules.
 */
export interface RegisteredSchedule {
  /** Unique identifier for this schedule registration */
  id: string;

  /** The plugin that registered this schedule */
  pluginId: string;

  /** The original schedule configuration */
  schedule: ScheduleConfig;

  /** When the schedule was registered (ISO 8601 string) */
  registeredAt: string;

  /** Whether the schedule is currently active */
  enabled: boolean;

  /** When this schedule will next run (ISO 8601 string) */
  nextRunAt?: string;

  /** When this schedule last ran (ISO 8601 string) */
  lastRunAt?: string;

  /** Number of times this schedule has executed since registration */
  runCount?: number;
}

/**
 * Context provided to plugins during initialization.
 *
 * The InitContext provides methods for registering triggers and schedules,
 * as well as metadata about the host application.
 */
export interface InitContext {
  /**
   * Semantic version of the Inbox Zero application.
   * Plugins can use this to check compatibility.
   *
   * Example: '1.2.3'
   */
  inboxZeroVersion: string;

  /**
   * Register an email trigger.
   *
   * @param trigger - The trigger configuration
   * @returns Promise resolving to the assigned trigger ID
   * @throws If the trigger configuration is invalid
   */
  registerTrigger(trigger: EmailTrigger): Promise<string>;

  /**
   * Unregister a previously registered trigger.
   *
   * @param triggerId - The ID of the trigger to unregister
   * @throws If the trigger ID is not found or belongs to another plugin
   */
  unregisterTrigger(triggerId: string): Promise<void>;

  /**
   * List all triggers registered by this plugin.
   *
   * @returns Promise resolving to an array of registered triggers
   */
  listTriggers(): Promise<RegisteredTrigger[]>;

  /**
   * Register a scheduled task.
   *
   * @param schedule - The schedule configuration
   * @returns Promise resolving to the assigned schedule ID
   * @throws If the schedule configuration is invalid or name conflicts
   */
  registerSchedule(schedule: ScheduleConfig): Promise<string>;

  /**
   * Unregister a previously registered schedule.
   *
   * @param scheduleId - The ID of the schedule to unregister
   * @throws If the schedule ID is not found or belongs to another plugin
   */
  unregisterSchedule(scheduleId: string): Promise<void>;

  /**
   * List all schedules registered by this plugin.
   *
   * @returns Promise resolving to an array of registered schedules
   */
  listSchedules(): Promise<RegisteredSchedule[]>;
}
