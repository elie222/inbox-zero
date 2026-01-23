import type { PluginEmailOperations } from "./email-operations";
import type {
  PluginEmail,
  PluginEmailAccount,
  PluginLLM,
  PluginStorage,
  PluginCalendar,
  PluginEmailSender,
} from "./contexts";

/**
 * Action types that a capability can perform on an email.
 */
export type CapabilityActionType =
  | "label"
  | "archive"
  | "draft"
  | "send"
  | "forward"
  | "custom";

/**
 * Represents an action taken by a capability handler.
 *
 * Actions provide a structured record of operations performed during
 * capability execution, enabling transparency and auditability.
 */
export interface CapabilityAction {
  /**
   * The type of action performed.
   */
  type: CapabilityActionType;

  /**
   * Parameters for the action, varies by action type.
   *
   * @example
   * // For 'label' action
   * { labelName: 'Important', threadId: 'thread-123' }
   *
   * @example
   * // For 'draft' action
   * { to: ['recipient@example.com'], subject: 'Re: Meeting', body: '...' }
   */
  params: Record<string, unknown>;

  /**
   * Whether the action was successfully executed.
   */
  executed: boolean;

  /**
   * Error message if execution failed.
   */
  error?: string;
}

/**
 * Explanation of what a capability did and why.
 *
 * Provides transparency for users to understand automated decisions.
 */
export interface CapabilityExplanation {
  /**
   * Brief summary of what the capability did.
   *
   * @example 'Scheduled meeting for Thursday at 2pm'
   * @example 'Categorized as newsletter and archived'
   */
  summary: string;

  /**
   * Optional detailed explanation of the reasoning or steps taken.
   */
  details?: string;
}

/**
 * Result returned from a capability handler after processing an email.
 *
 * Contains information about whether the capability handled the email,
 * what actions were taken, and an explanation for the user.
 */
export interface CapabilityResult {
  /**
   * Whether the capability successfully handled the email.
   *
   * If false, the router may try other capabilities or fall back
   * to default behavior.
   */
  handled: boolean;

  /**
   * Actions taken by the capability.
   *
   * Provides a structured record of all operations performed,
   * useful for transparency and debugging.
   */
  actions?: CapabilityAction[];

  /**
   * Human-readable explanation of what was done.
   *
   * Displayed to users to provide transparency about automated decisions.
   */
  explanation: CapabilityExplanation;

  /**
   * Confidence score for the result (0-1).
   *
   * Higher values indicate more certainty about the action taken.
   * May be used by the router to determine whether to apply the result.
   */
  confidence?: number;
}

/**
 * Context provided to capability handlers during execution.
 *
 * Contains the email being processed, account information, and
 * interfaces for interacting with the system (LLM, storage, etc.).
 *
 * Optional capabilities (calendar, emailSender, emailOperations) are
 * only available if the plugin has declared the required permissions.
 */
export interface CapabilityContext {
  /**
   * The email being processed by the capability.
   */
  email: PluginEmail;

  /**
   * Information about the email account receiving the email.
   */
  emailAccount: PluginEmailAccount;

  /**
   * LLM interface for AI-powered analysis and generation.
   */
  llm: PluginLLM;

  /**
   * Storage interface for persisting capability data.
   */
  storage: PluginStorage;

  /**
   * Calendar interface for reading/writing calendar events.
   *
   * Only available if plugin declares calendar permissions.
   */
  calendar?: PluginCalendar;

  /**
   * Email sending interface for composing and sending emails.
   *
   * Only available if plugin declares email:send capability.
   */
  emailSender?: PluginEmailSender;

  /**
   * Email operations interface for labeling, archiving, etc.
   *
   * Only available if plugin declares email:modify capability.
   */
  emailOperations?: PluginEmailOperations;
}

/**
 * A handler that can process specific types of emails.
 *
 * Capability handlers are the building blocks of intelligent email processing.
 * Each handler specializes in a particular domain (scheduling, receipts,
 * newsletters, etc.) and can decide whether to handle incoming emails.
 *
 * The router uses routing hints and the optional `canHandle` method to
 * determine which capabilities should process an email.
 *
 * @example
 * ```typescript
 * const schedulingCapability: CapabilityHandler = {
 *   id: 'meeting-scheduler',
 *   name: 'Meeting Scheduler',
 *   description: 'Handles meeting requests and scheduling emails',
 *   routingHints: ['meeting', 'schedule', 'calendar', 'invite', 'appointment'],
 *   requires: ['calendar'],
 *
 *   async canHandle(ctx) {
 *     // Quick check based on email content
 *     const { subject, snippet } = ctx.email;
 *     const text = `${subject} ${snippet}`.toLowerCase();
 *     return text.includes('meeting') || text.includes('schedule');
 *   },
 *
 *   async execute(ctx) {
 *     const { email, llm, calendar } = ctx;
 *
 *     // Analyze the email for meeting details
 *     const analysis = await llm.generateObject({
 *       prompt: `Extract meeting details from: ${email.body}`,
 *       schema: meetingSchema,
 *     });
 *
 *     // Create calendar event if appropriate
 *     if (analysis.object.shouldSchedule && calendar) {
 *       await calendar.createEvent({
 *         summary: analysis.object.title,
 *         start: analysis.object.startTime,
 *         end: analysis.object.endTime,
 *       });
 *     }
 *
 *     return {
 *       handled: true,
 *       actions: [{ type: 'custom', params: { action: 'scheduled' }, executed: true }],
 *       explanation: {
 *         summary: `Scheduled meeting: ${analysis.object.title}`,
 *         details: `Created calendar event for ${analysis.object.startTime}`,
 *       },
 *       confidence: 0.95,
 *     };
 *   },
 * };
 * ```
 */
export interface CapabilityHandler {
  /**
   * Unique identifier for this capability.
   *
   * Used for routing, logging, and configuration.
   * Should be kebab-case (e.g., 'meeting-scheduler').
   */
  id: string;

  /**
   * Human-readable name for this capability.
   *
   * Displayed in UI and logs.
   */
  name: string;

  /**
   * Description of what this capability handles.
   *
   * Used by the router to make intelligent routing decisions.
   * Be specific about the types of emails this capability handles.
   */
  description: string;

  /**
   * Keywords that suggest this capability should handle an email.
   *
   * The router uses these hints along with LLM analysis to determine
   * which capabilities are relevant for an incoming email.
   *
   * @example ['meeting', 'schedule', 'calendar', 'invite', 'appointment']
   * @example ['receipt', 'order', 'purchase', 'invoice', 'payment']
   */
  routingHints: string[];

  /**
   * Required integrations for this capability to function.
   *
   * The runtime will only invoke this capability if the user has
   * connected the required integrations.
   *
   * @example ['calendar'] - Requires calendar access
   * @example ['calendar', 'crm'] - Requires both calendar and CRM
   */
  requires?: string[];

  /**
   * Execute the capability on an email.
   *
   * Called when the router determines this capability should handle
   * an email. Should perform the capability's core logic and return
   * a result indicating what was done.
   *
   * @param ctx - Context containing email, account info, and interfaces
   * @returns Result indicating whether the email was handled and what actions were taken
   */
  execute(ctx: CapabilityContext): Promise<CapabilityResult>;

  /**
   * Optional: Validate if this capability can handle the email.
   *
   * Provides a fast check before full execution. If implemented,
   * the router may call this to filter capabilities before invoking
   * the more expensive `execute` method.
   *
   * @param ctx - Context containing email and account info
   * @returns True if this capability can handle the email
   */
  canHandle?(ctx: CapabilityContext): Promise<boolean>;
}
