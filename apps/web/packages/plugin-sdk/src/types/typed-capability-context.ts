/**
 * Typed Capability Contexts
 *
 * This module provides type-level linking between declared capabilities
 * and available context properties. Use these types to get precise
 * TypeScript support based on your plugin's declared capabilities.
 *
 * @example Basic usage with capability inference
 * ```typescript
 * import { TypedCapabilityContext } from '@inbox-zero/plugin-sdk';
 *
 * // Declare your capabilities
 * type MyCapabilities = 'email:send' | 'calendar:write';
 *
 * // Get a typed context with only the properties you have access to
 * type MyContext = TypedCapabilityContext<MyCapabilities>;
 * // MyContext.emailSender is defined (not optional)
 * // MyContext.calendar is defined (not optional)
 * // MyContext.emailOperations is undefined
 * ```
 */

import type { PluginCapability } from "../schemas/plugin-manifest";
import type {
  PluginEmail,
  PluginEmailAccount,
  PluginLLM,
  PluginStorage,
  PluginCalendar,
  PluginEmailSender,
} from "./contexts";
import type { PluginEmailOperations } from "./email-operations";

// ---------------------------------------------------------------------------
// Capability to Context Property Mappings
// ---------------------------------------------------------------------------

/**
 * Capabilities that grant access to the email sender interface
 */
export type EmailSendCapabilities = "email:send" | "email:send_as";

/**
 * Capabilities that grant access to email operations (label, archive, etc.)
 */
export type EmailModifyCapabilities = "email:modify";

/**
 * Capabilities that grant access to calendar read operations
 */
export type CalendarReadCapabilities =
  | "calendar:read"
  | "calendar:list"
  | "calendar:write";

/**
 * Capabilities that grant access to calendar write operations
 */
export type CalendarWriteCapabilities = "calendar:write";

/**
 * Capabilities that grant full email body access (not just metadata)
 */
export type FullEmailAccessCapabilities =
  | "email:draft"
  | "email:send"
  | "automation:rule"
  | "followup:detect"
  | "mcp:access";

/**
 * Capabilities that only need email metadata (subject, from, snippet)
 */
export type MetadataOnlyCapabilities =
  | "email:classify"
  | "email:signal"
  | "email:trigger"
  | "email:modify";

// ---------------------------------------------------------------------------
// Typed Context Interfaces
// ---------------------------------------------------------------------------

/**
 * Base context properties always available regardless of capabilities
 */
export interface BaseCapabilityContext {
  /**
   * LLM interface for AI operations.
   * Always available in all contexts.
   */
  llm: PluginLLM;

  /**
   * Scoped storage for plugin data.
   * Always available in all contexts.
   */
  storage: PluginStorage;

  /**
   * Email account information.
   * Always available in email-related contexts.
   */
  emailAccount: PluginEmailAccount;
}

/**
 * Context with email sender available (requires email:send or email:send_as)
 */
export interface WithEmailSender {
  /**
   * Email sending interface for composing and sending emails.
   * Available because email:send capability is declared.
   */
  emailSender: PluginEmailSender;
}

/**
 * Context with email operations available (requires email:modify)
 */
export interface WithEmailOperations {
  /**
   * Email operations interface for labeling, archiving, etc.
   * Available because email:modify capability is declared.
   */
  emailOperations: PluginEmailOperations;
}

/**
 * Context with calendar access (requires calendar:read, calendar:list, or calendar:write)
 */
export interface WithCalendar {
  /**
   * Calendar interface for reading/writing calendar events.
   * Available because a calendar capability is declared.
   */
  calendar: PluginCalendar;
}

/**
 * Context with full email body access
 */
export interface WithFullEmailAccess {
  /**
   * Email data with full body content.
   * Available because a capability requiring full email access is declared.
   */
  email: PluginEmail & { body: string };
}

/**
 * Context with metadata-only email access
 */
export interface WithMetadataEmailAccess {
  /**
   * Email data with metadata only (no body).
   * Body field is undefined because only metadata capabilities are declared.
   */
  email: Omit<PluginEmail, "body">;
}

// ---------------------------------------------------------------------------
// Main Typed Context Type
// ---------------------------------------------------------------------------

/**
 * A capability context with properties typed based on declared capabilities.
 *
 * This type provides precise TypeScript support by making context properties
 * required or undefined based on which capabilities your plugin declares.
 *
 * @template C - Union of declared capability strings
 *
 * @example Email classification (metadata only)
 * ```typescript
 * type ClassifyContext = TypedCapabilityContext<'email:classify'>;
 *
 * async function classify(ctx: ClassifyContext) {
 *   // ctx.email has subject, from, snippet - but NO body
 *   // ctx.emailSender is undefined
 *   // ctx.emailOperations is undefined
 *   // ctx.calendar is undefined
 *   console.log(ctx.email.subject);
 * }
 * ```
 *
 * @example Full email with calendar access
 * ```typescript
 * type SchedulerContext = TypedCapabilityContext<'email:draft' | 'calendar:write'>;
 *
 * async function schedule(ctx: SchedulerContext) {
 *   // ctx.email has full body access
 *   // ctx.calendar is available
 *   // ctx.emailSender is undefined
 *   console.log(ctx.email.body);
 *   await ctx.calendar.createEvent({ ... });
 * }
 * ```
 *
 * @example Full automation context
 * ```typescript
 * type AutomationContext = TypedCapabilityContext<
 *   'email:send' | 'email:modify' | 'calendar:write'
 * >;
 *
 * async function automate(ctx: AutomationContext) {
 *   // All optional fields are available
 *   await ctx.emailSender.send({ ... });
 *   await ctx.emailOperations.applyLabel(...);
 *   await ctx.calendar.createEvent({ ... });
 * }
 * ```
 */
export type TypedCapabilityContext<C extends PluginCapability> =
  BaseCapabilityContext &
    // email access level
    (C extends FullEmailAccessCapabilities
      ? WithFullEmailAccess
      : C extends MetadataOnlyCapabilities
        ? WithMetadataEmailAccess
        : { email: PluginEmail }) &
    // optional interfaces based on capabilities
    (C extends EmailSendCapabilities
      ? WithEmailSender
      : { emailSender?: undefined }) &
    (C extends EmailModifyCapabilities
      ? WithEmailOperations
      : { emailOperations?: undefined }) &
    (C extends CalendarReadCapabilities
      ? WithCalendar
      : { calendar?: undefined });

// ---------------------------------------------------------------------------
// Pre-built Context Types for Common Capability Combinations
// ---------------------------------------------------------------------------

/**
 * Context for email classification capabilities.
 * Has metadata-only email access.
 *
 * @example
 * ```typescript
 * async function classify(ctx: ClassifyContext) {
 *   // ctx.email has subject, from, snippet - but NO body
 *   console.log(ctx.email.subject);
 * }
 * ```
 */
export type ClassifyContext = TypedCapabilityContext<"email:classify">;

/**
 * Context for email drafting capabilities.
 * Has full email body access.
 *
 * @example
 * ```typescript
 * async function draft(ctx: DraftCapabilityContext) {
 *   // ctx.email has full body access
 *   const reply = await ctx.llm.generateText({
 *     prompt: `Draft reply to: ${ctx.email.body}`,
 *   });
 * }
 * ```
 */
export type DraftCapabilityContext = TypedCapabilityContext<"email:draft">;

/**
 * Context for email sending capabilities.
 * Has full email access and emailSender.
 *
 * @example
 * ```typescript
 * async function send(ctx: SendContext) {
 *   await ctx.emailSender.send({
 *     to: ['recipient@example.com'],
 *     subject: 'Hello',
 *     body: 'Message content',
 *   });
 * }
 * ```
 */
export type SendContext = TypedCapabilityContext<"email:send">;

/**
 * Context for email modification capabilities.
 * Has metadata access and emailOperations.
 *
 * @example
 * ```typescript
 * async function modify(ctx: ModifyContext) {
 *   await ctx.emailOperations.applyLabel(ctx.email.threadId, 'Important');
 *   await ctx.emailOperations.archive(ctx.email.threadId);
 * }
 * ```
 */
export type ModifyContext = TypedCapabilityContext<"email:modify">;

/**
 * Context for follow-up detection capabilities.
 * Has full email body access.
 *
 * @example
 * ```typescript
 * async function detectFollowup(ctx: FollowupContext) {
 *   const needsFollowup = ctx.email.body.includes('please respond');
 * }
 * ```
 */
export type FollowupContext = TypedCapabilityContext<"followup:detect">;

/**
 * Context for calendar-aware capabilities.
 * Has calendar access.
 *
 * @example
 * ```typescript
 * async function checkCalendar(ctx: CalendarCapabilityContext) {
 *   const events = await ctx.calendar.listEvents({
 *     timeMin: new Date(),
 *     timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
 *   });
 * }
 * ```
 */
export type CalendarCapabilityContext = TypedCapabilityContext<"calendar:read">;

/**
 * Context for full automation capabilities.
 * Has all optional interfaces available.
 *
 * @example
 * ```typescript
 * async function automate(ctx: FullAutomationContext) {
 *   // All optional fields are available
 *   await ctx.emailSender.send({ ... });
 *   await ctx.emailOperations.applyLabel(...);
 *   await ctx.calendar.createEvent({ ... });
 * }
 * ```
 */
export type FullAutomationContext = TypedCapabilityContext<
  "email:send" | "email:modify" | "calendar:write"
>;

/**
 * Context for scheduling capabilities.
 * Has full email and calendar write access.
 *
 * @example
 * ```typescript
 * async function schedule(ctx: SchedulerContext) {
 *   const meetingInfo = extractMeetingDetails(ctx.email.body);
 *   await ctx.calendar.createEvent({
 *     summary: meetingInfo.title,
 *     start: { dateTime: meetingInfo.startTime },
 *     end: { dateTime: meetingInfo.endTime },
 *   });
 * }
 * ```
 */
export type SchedulerContext = TypedCapabilityContext<
  "email:draft" | "calendar:write"
>;

// ---------------------------------------------------------------------------
// Documentation: Capability to Context Property Matrix
// ---------------------------------------------------------------------------

/**
 * ## Capability to Context Property Matrix
 *
 * | Capability        | email.body | emailSender | emailOperations | calendar |
 * |-------------------|------------|-------------|-----------------|----------|
 * | email:classify    | ❌         | ❌          | ❌              | ❌       |
 * | email:draft       | ✅         | ❌          | ❌              | ❌       |
 * | email:send        | ✅         | ✅          | ❌              | ❌       |
 * | email:send_as     | ✅         | ✅          | ❌              | ❌       |
 * | email:signal      | ❌         | ❌          | ❌              | ❌       |
 * | email:trigger     | ❌         | ❌          | ❌              | ❌       |
 * | email:modify      | ❌         | ❌          | ✅              | ❌       |
 * | automation:rule   | ✅         | ❌          | ❌              | ❌       |
 * | followup:detect   | ✅         | ❌          | ❌              | ❌       |
 * | calendar:read     | ❌         | ❌          | ❌              | ✅       |
 * | calendar:write    | ❌         | ❌          | ❌              | ✅       |
 * | calendar:list     | ❌         | ❌          | ❌              | ✅       |
 * | mcp:access        | ✅         | ❌          | ❌              | ❌       |
 *
 * ### Notes:
 *
 * - **email.body**: Full email content. Required for drafting, sending, rules.
 * - **emailSender**: Ability to send emails. Requires explicit send capability.
 * - **emailOperations**: Label, archive, move emails. Requires modify capability.
 * - **calendar**: Read/write calendar events. Any calendar capability unlocks read.
 *
 * ### Combining Capabilities:
 *
 * When multiple capabilities are declared, you get the union of their access:
 *
 * ```typescript
 * // email:classify + email:modify + calendar:read
 * type Combined = TypedCapabilityContext<
 *   'email:classify' | 'email:modify' | 'calendar:read'
 * >;
 * // Result: metadata email access + emailOperations + calendar
 * ```
 */
export type CapabilityContextMatrix = never; // documentation only
