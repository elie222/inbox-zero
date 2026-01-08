import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

// Re-export context types from SDK for consistency
export type {
  EmailContext,
  DraftContext,
  TriggeredEmailContext,
  ScheduledTriggerContext,
  RuleContext,
  CalendarContext,
  PluginLLM,
  PluginStorage,
  PluginCalendar,
  PluginEmailSender,
  Calendar,
  CalendarEvent,
  CreateEventInput,
  UpdateEventInput,
  EmailTrigger,
  RegisteredTrigger,
  ScheduleConfig,
  RegisteredSchedule,
  PluginEmail,
  PluginEmailAccount,
} from "@/packages/plugin-sdk/src/types/contexts";

/**
 * Plugin interface defining the hooks that plugins can implement.
 * Plugins export a default object implementing some or all of these methods.
 */
export interface InboxZeroPlugin {
  /**
   * Plugin initialization - register triggers and schedules.
   * Called once when the plugin is loaded.
   */
  onInit?(ctx: InitContext): Promise<void>;

  /**
   * Email classification hook.
   * Called when processing incoming emails to add classification signals.
   */
  classifyEmail?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").EmailContext,
  ): Promise<Classification | null>;

  /**
   * Draft reply generation.
   * Called when generating draft responses to emails.
   */
  draftReply?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").DraftContext,
  ): Promise<Draft | null>;

  /**
   * Signal emission for automation.
   * Called when emails are received to emit signals for rule processing.
   */
  onEmailReceived?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").EmailContext,
  ): Promise<EmailSignal[]>;

  /**
   * Triggered email handler.
   * Called when registered triggers (plus-tags, patterns) match incoming emails.
   */
  onTriggeredEmail?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").TriggeredEmailContext,
  ): Promise<void>;

  /**
   * Scheduled execution (cron-based).
   * Called when a registered schedule triggers.
   */
  onScheduledTrigger?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").ScheduledTriggerContext,
  ): Promise<void>;

  /**
   * Custom rule evaluation.
   * Called during rule processing to allow plugin-specific rule logic.
   */
  evaluateRule?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").RuleContext,
  ): Promise<RuleResult | null>;

  /**
   * Follow-up detection.
   * Called to detect if an email needs follow-up.
   */
  detectFollowup?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").EmailContext,
  ): Promise<FollowupResult | null>;

  /**
   * Calendar event hook.
   * Called when calendar events are processed.
   */
  onCalendarEvent?(
    ctx: import("@/packages/plugin-sdk/src/types/contexts").CalendarContext,
  ): Promise<void>;

  /**
   * Chat tools that extend the main Inbox Zero assistant.
   * These tools become available to the AI during chat conversations.
   */
  chatTools?: import("@/packages/plugin-sdk/src/types/chat").PluginChatTools;

  /**
   * Context to inject into the assistant's system prompt.
   * Use this to customize assistant behavior, add knowledge, or set tone.
   */
  chatContext?: import("@/packages/plugin-sdk/src/types/chat").PluginChatContext;
}

/**
 * A loaded plugin with its manifest, module, and filesystem path.
 */
export interface LoadedPlugin {
  /** Unique plugin identifier from manifest */
  id: string;

  /** Parsed and validated plugin manifest */
  manifest: PluginManifest;

  /** The loaded plugin module with hook implementations */
  module: InboxZeroPlugin;

  /** Absolute filesystem path to the plugin directory */
  path: string;
}

/**
 * Result of plugin loading - either success with the plugin or failure with error details.
 */
export type PluginLoadResult =
  | { success: true; plugin: LoadedPlugin }
  | { success: false; pluginPath: string; error: string };

/**
 * Context for plugin initialization.
 */
export interface InitContext {
  inboxZeroVersion: string;
  registerTrigger(
    trigger: import("@/packages/plugin-sdk/src/types/contexts").EmailTrigger,
  ): Promise<string>;
  unregisterTrigger(triggerId: string): Promise<void>;
  listTriggers(): Promise<
    import("@/packages/plugin-sdk/src/types/contexts").RegisteredTrigger[]
  >;
  registerSchedule(
    schedule: import("@/packages/plugin-sdk/src/types/contexts").ScheduleConfig,
  ): Promise<string>;
  unregisterSchedule(scheduleId: string): Promise<void>;
  listSchedules(): Promise<
    import("@/packages/plugin-sdk/src/types/contexts").RegisteredSchedule[]
  >;
}

/**
 * Result types from plugin hooks.
 */
export interface Classification {
  label: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Draft {
  body: string;
  confidence: number;
  subject?: string;
}

export interface EmailSignal {
  type: string;
  value: unknown;
  confidence?: number;
}

export interface RuleResult {
  matched: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface FollowupResult {
  needsFollowup: boolean;
  confidence: number;
  suggestedDate?: Date;
  reason?: string;
}
