import type { z } from "zod";
import type { PluginEmailOperations } from "./email-operations";
import type {
  PluginCalendar,
  Calendar,
  CalendarEvent,
  CalendarEventAttendee,
  CreateEventInput,
  UpdateEventInput,
  RespondToEventInput,
} from "./calendar";

// Re-export calendar types for backwards compatibility
export type {
  Calendar,
  CalendarEvent,
  CreateEventInput,
  UpdateEventInput,
  RespondToEventInput,
};
export type { CalendarEventAttendee as CalendarAttendee };

/**
 * Email provider types supported by Inbox Zero
 */
export type EmailProvider = "google" | "microsoft";

/**
 * Email data available to plugins (fields gated by permissions)
 */
export interface PluginEmail {
  /** Unique email identifier */
  id: string;

  /** Thread identifier for replying */
  threadId?: string;

  /** Email subject line */
  subject: string;

  /** Sender email address */
  from: string;

  /** Preview snippet of the email body */
  snippet: string;

  /** Full email body (only if 'body' permission granted) */
  body?: string;

  /** Email headers as key-value pairs */
  headers: Record<string, string>;
}

/**
 * Email account information
 */
export interface PluginEmailAccount {
  /** Email address of the account */
  email: string;

  /** Email provider */
  provider: EmailProvider;
}

/**
 * LLM model tier for controlling quality vs cost tradeoffs
 * - economy: Fastest, cheapest model for simple tasks
 * - chat: Balanced model for conversational tasks (default)
 * - reasoning: Most capable model for complex analysis
 */
export type LLMTier = "economy" | "chat" | "reasoning";

/**
 * Result of a tool call during generation with MCP tools.
 */
export interface ToolCallResult {
  /** Name of the tool that was called */
  toolName: string;
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** Result returned by the tool */
  result: unknown;
}

/**
 * Result of text generation with MCP tools.
 */
export interface GenerateTextWithToolsResult {
  /** The final generated text after tool execution */
  text: string;
  /** Tool calls made during generation */
  toolCalls: ToolCallResult[];
}

/**
 * LLM interface for plugins - provides scoped access to language models
 */
export interface PluginLLM {
  /**
   * Generate text completion
   * @param options - Generation options
   * @returns Generated text string
   */
  generateText(options: {
    prompt: string;
    system?: string;
    /** Model tier for this call. Defaults to 'chat'. */
    tier?: LLMTier;
  }): Promise<string>;

  /**
   * Generate structured object output
   * @param options - Generation options with Zod schema
   * @returns Object matching the provided schema
   */
  generateObject<T>(options: {
    prompt: string;
    schema: z.ZodSchema<T>;
    system?: string;
    /** Model tier for this call. Defaults to 'chat'. */
    tier?: LLMTier;
  }): Promise<{ object: T }>;

  /**
   * Generate text with MCP tools available.
   *
   * Requires the mcp:access capability to be declared in plugin.json.
   * The runtime automatically injects the user's connected MCP tools
   * (Notion, Stripe, Monday, etc.) into the LLM call.
   *
   * @param options - Generation options including prompt, system message, and max steps
   * @returns The generated text and any tool calls made
   * @throws PluginCapabilityError if mcp:access capability not declared
   */
  generateTextWithTools?(options: {
    prompt: string;
    system?: string;
    /** LLM tier for model selection (default: 'chat'). */
    tier?: LLMTier;
    /** Maximum number of tool execution steps (default: 5, max: 10). */
    maxSteps?: number;
  }): Promise<GenerateTextWithToolsResult>;
}

/**
 * Scoped storage interface for plugins
 * Storage is namespaced per-plugin and isolated from other plugins
 */
export interface PluginStorage {
  /**
   * Get a value from plugin storage
   * @param key - Storage key
   * @returns Value or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in plugin storage
   * @param key - Storage key
   * @param value - Value to store
   * @param ttl - Optional TTL in seconds
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a value from plugin storage
   * @param key - Storage key
   */
  delete(key: string): Promise<void>;

  /**
   * Get user-level settings for this plugin
   * @returns User settings or null
   */
  getUserSettings<T>(): Promise<T | null>;

  /**
   * Set user-level settings for this plugin
   * @param settings - Settings object
   */
  setUserSettings<T>(settings: T): Promise<void>;

  /**
   * Get email-account-level settings for this plugin
   * @returns Account settings or null
   */
  getAccountSettings<T>(): Promise<T | null>;

  /**
   * Set email-account-level settings for this plugin
   * @param settings - Settings object
   */
  setAccountSettings<T>(settings: T): Promise<void>;
}

// Re-export PluginCalendar from canonical source
export type { PluginCalendar };

/**
 * Email sending interface for plugins (requires email:send capability)
 */
export interface PluginEmailSender {
  /**
   * Send a new email
   * @param options - Email options
   * @returns Sent message ID
   */
  send(options: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyType?: "text" | "html";
    /**
     * Optional sender address override. Requires `email:send_as` capability.
     * Must be a plus-tag variant of the user's email (e.g., user+tag@domain.com).
     */
    from?: string;
    /** Optional reply-to address */
    replyTo?: string;
  }): Promise<{ messageId: string }>;

  /**
   * Reply to an existing thread
   * @param options - Reply options
   * @returns Sent message ID
   */
  reply(options: {
    threadId: string;
    body: string;
    bodyType?: "text" | "html";
    /**
     * Optional sender address override. Requires `email:send_as` capability.
     * Must be a plus-tag variant of the user's email (e.g., user+tag@domain.com).
     */
    from?: string;
  }): Promise<{ messageId: string }>;
}

/**
 * Base context available to all plugin hooks
 */
export interface BaseContext {
  /** LLM interface for AI operations */
  llm: PluginLLM;

  /** Scoped storage for plugin data */
  storage: PluginStorage;
}

/**
 * Context for email-related hooks
 */
export interface EmailContext extends BaseContext {
  /** Email data (fields gated by permissions) */
  email: PluginEmail;

  /** Email account information */
  emailAccount: PluginEmailAccount;

  /** Calendar access (only if calendar permission granted) */
  calendar: PluginCalendar;
}

/**
 * Context for draft generation hooks
 * Extends EmailContext with additional draft-specific data
 */
export interface DraftContext extends EmailContext {
  /** Thread context for reply drafts */
  thread?: {
    /** Thread identifier */
    id: string;

    /** Previous messages in the thread */
    messages: Array<{
      id: string;
      from: string;
      subject: string;
      snippet: string;
      body?: string;
      date: string;
    }>;
  };

  /** User preferences for draft generation */
  preferences?: {
    /** Preferred tone (e.g., 'formal', 'casual', 'professional') */
    tone?: string;

    /** Signature to append */
    signature?: string;

    /** Language preference */
    language?: string;
  };
}

/**
 * Context for custom rule evaluation
 */
export interface RuleContext extends BaseContext {
  /** Email data for rule evaluation */
  email: PluginEmail;

  /** Email account information */
  emailAccount: PluginEmailAccount;

  /** Rule-specific data passed from rule configuration */
  ruleData?: Record<string, unknown>;
}

/**
 * Context for calendar event hooks
 */
export interface CalendarContext extends BaseContext {
  /** Calendar event that triggered the hook */
  event: CalendarEvent;

  /** Email account information */
  emailAccount: PluginEmailAccount;

  /** Calendar access */
  calendar: PluginCalendar;
}

/**
 * Trigger type for email triggers
 */
export type TriggerType =
  | "plus-tag"
  | "from-pattern"
  | "subject-pattern"
  | "custom";

/**
 * Context for triggered email handlers
 * Called when a registered trigger matches an incoming email
 */
export interface TriggeredEmailContext extends EmailContext {
  /** Unique identifier of the trigger that matched */
  triggerId: string;

  /** Type of trigger that matched */
  triggerType: TriggerType;

  /** The value that caused the match (e.g., the plus tag, matched pattern) */
  matchedValue: string;

  /** Email sending capability. Throws PluginCapabilityError if email:send not declared. */
  emailSender: PluginEmailSender;

  /** Email operations capability. Throws PluginCapabilityError if email:modify not declared. */
  emailOperations: PluginEmailOperations;
}

/**
 * Context for scheduled trigger handlers (cron-based execution)
 */
export interface ScheduledTriggerContext extends BaseContext {
  /** Unique identifier of the schedule */
  scheduleId: string;

  /** Human-readable name of the schedule */
  scheduleName: string;

  /** When this execution was scheduled for */
  scheduledAt: Date;

  /** Custom data passed when schedule was registered */
  data?: Record<string, unknown>;

  /** Calendar access */
  calendar: PluginCalendar;

  /** Email sending capability. Throws PluginCapabilityError if email:send not declared. */
  emailSender: PluginEmailSender;

  /** Email operations capability. Throws PluginCapabilityError if email:modify not declared. */
  emailOperations: PluginEmailOperations;

  /** Email account information */
  emailAccount: PluginEmailAccount;
}

/**
 * Email trigger configuration for registration
 */
export interface EmailTrigger {
  /** Plus-addressing pattern (e.g., 'newsletter' matches user+newsletter@domain.com) */
  plusTag?: string;

  /** From address pattern (glob or regex string) */
  fromPattern?: string;

  /** Subject pattern (glob or regex string) */
  subjectPattern?: string;

  /** Custom matcher function for complex logic */
  matcher?: (email: PluginEmail) => boolean;
}

/**
 * Registered trigger information
 */
export interface RegisteredTrigger {
  /** Unique trigger identifier */
  id: string;

  /** Plugin that registered this trigger */
  pluginId: string;

  /** Trigger configuration */
  trigger: EmailTrigger;

  /** When the trigger was registered */
  registeredAt: Date;
}

/**
 * Schedule configuration for cron-based triggers
 */
export interface ScheduleConfig {
  /** Human-readable name for the schedule */
  name: string;

  /** Cron expression (e.g., '0 7 * * *' for 7am daily) */
  cron: string;

  /** IANA timezone (defaults to user's timezone) */
  timezone?: string;

  /** Custom data passed to handler on each execution */
  data?: Record<string, unknown>;
}

/**
 * Registered schedule information
 */
export interface RegisteredSchedule {
  /** Unique schedule identifier */
  id: string;

  /** Plugin that registered this schedule */
  pluginId: string;

  /** Schedule configuration */
  config: ScheduleConfig;

  /** When the schedule was registered */
  registeredAt: Date;

  /** Next scheduled execution time */
  nextRunAt?: Date;
}

/**
 * Context for plugin initialization
 * Used to register triggers, schedules, and other runtime configuration
 */
export interface InitContext extends BaseContext {
  /**
   * Register an email trigger
   * @param trigger - Trigger configuration
   * @returns Unique trigger ID
   */
  registerTrigger(trigger: EmailTrigger): Promise<string>;

  /**
   * Unregister a previously registered trigger
   * @param triggerId - Trigger ID to remove
   */
  unregisterTrigger(triggerId: string): Promise<void>;

  /**
   * List all triggers registered by this plugin
   * @returns Array of registered triggers
   */
  listTriggers(): Promise<RegisteredTrigger[]>;

  /**
   * Register a scheduled task
   * @param schedule - Schedule configuration
   * @returns Unique schedule ID
   */
  registerSchedule(schedule: ScheduleConfig): Promise<string>;

  /**
   * Unregister a previously registered schedule
   * @param scheduleId - Schedule ID to remove
   */
  unregisterSchedule(scheduleId: string): Promise<void>;

  /**
   * List all schedules registered by this plugin
   * @returns Array of registered schedules
   */
  listSchedules(): Promise<RegisteredSchedule[]>;

  /** Current Inbox Zero version for compatibility checks */
  inboxZeroVersion: string;

  /** Email account this plugin is being initialized for */
  emailAccount: PluginEmailAccount;
}
