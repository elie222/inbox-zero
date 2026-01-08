import type {
  InitContext,
  EmailContext,
  DraftContext,
  TriggeredEmailContext,
  ScheduledTriggerContext,
  RuleContext,
  CalendarContext,
} from "./contexts";

import type {
  Classification,
  Draft,
  EmailSignal,
  RuleResult,
  FollowupResult,
} from "./results";

import type { PluginChatTools, PluginChatContext } from "./chat";

/**
 * Main plugin interface defining all available hooks.
 *
 * Plugins implement the hooks they need based on their declared capabilities
 * in plugin.json. Each hook is optional - only implement what you need.
 *
 * @example
 * ```typescript
 * import { definePlugin } from '@inbox-zero/plugin-sdk';
 *
 * export default definePlugin({
 *   async classifyEmail(ctx) {
 *     if (ctx.email.subject.includes('urgent')) {
 *       return { label: 'Urgent', confidence: 0.95 };
 *     }
 *     return null;
 *   },
 *
 *   async draftReply(ctx) {
 *     const response = await ctx.llm.generateText({
 *       prompt: `Draft a reply to: ${ctx.email.snippet}`,
 *     });
 *     return { body: response, confidence: 0.8 };
 *   },
 * });
 * ```
 */
export interface InboxZeroPlugin {
  /**
   * Plugin initialization hook - register triggers and schedules.
   * Called once when the plugin is loaded for an email account.
   *
   * Use this to register email triggers (plus-tags, patterns) and
   * scheduled tasks (cron-based execution).
   *
   * @example
   * ```typescript
   * async onInit(ctx) {
   *   await ctx.registerTrigger({ plusTag: 'newsletter' });
   *   await ctx.registerSchedule({
   *     name: 'daily-digest',
   *     cron: '0 9 * * *',
   *   });
   * }
   * ```
   */
  onInit?(ctx: InitContext): Promise<void>;

  /**
   * Email classification hook - add labels/signals to incoming emails.
   * Called for each incoming email to determine classification.
   *
   * Requires capability: email:classify
   *
   * @returns Classification with label and confidence, or null if no classification
   *
   * @example
   * ```typescript
   * async classifyEmail(ctx) {
   *   const result = await ctx.llm.generateObject({
   *     schema: classificationSchema,
   *     prompt: `Classify this email: ${ctx.email.snippet}`,
   *   });
   *   return result.object;
   * }
   * ```
   */
  classifyEmail?(ctx: EmailContext): Promise<Classification | null>;

  /**
   * Draft reply generation hook.
   * Called when a draft reply is requested for an email.
   *
   * Requires capability: email:draft
   *
   * @returns Draft with body content and confidence, or null if no draft
   *
   * @example
   * ```typescript
   * async draftReply(ctx) {
   *   const draft = await ctx.llm.generateText({
   *     prompt: `Draft a professional reply to: ${ctx.email.subject}`,
   *   });
   *   return { body: draft, confidence: 0.85 };
   * }
   * ```
   */
  draftReply?(ctx: DraftContext): Promise<Draft | null>;

  /**
   * Signal emission hook for automation.
   * Called when an email is received to emit signals for rule evaluation.
   *
   * Signals are used by the automation system to trigger rules and actions.
   *
   * Requires capability: email:signal
   *
   * @returns Array of signals to emit (can be empty)
   *
   * @example
   * ```typescript
   * async onEmailReceived(ctx) {
   *   const signals: EmailSignal[] = [];
   *   if (ctx.email.from.includes('@important-client.com')) {
   *     signals.push({ type: 'vip-sender', strength: 1.0 });
   *   }
   *   return signals;
   * }
   * ```
   */
  onEmailReceived?(ctx: EmailContext): Promise<EmailSignal[]>;

  /**
   * Triggered email handler - called when registered triggers match.
   * Use onInit to register triggers, then handle matches here.
   *
   * Requires capability: email:trigger
   *
   * @example
   * ```typescript
   * async onTriggeredEmail(ctx) {
   *   if (ctx.triggerType === 'plus-tag' && ctx.matchedValue === 'crm') {
   *     await syncToCRM(ctx.email);
   *   }
   * }
   * ```
   */
  onTriggeredEmail?(ctx: TriggeredEmailContext): Promise<void>;

  /**
   * Scheduled execution hook - called based on cron schedule.
   * Use onInit to register schedules, then handle execution here.
   *
   * Requires capability: schedule:cron
   *
   * @example
   * ```typescript
   * async onScheduledTrigger(ctx) {
   *   if (ctx.scheduleName === 'daily-digest') {
   *     const events = await ctx.calendar.listEvents({ timeMin: new Date() });
   *     await sendDigestEmail(ctx, events);
   *   }
   * }
   * ```
   */
  onScheduledTrigger?(ctx: ScheduledTriggerContext): Promise<void>;

  /**
   * Custom rule evaluation hook.
   * Called when the automation system needs to evaluate a custom rule.
   *
   * Requires capability: automation:rule
   *
   * @returns RuleResult indicating match status and optional actions
   *
   * @example
   * ```typescript
   * async evaluateRule(ctx) {
   *   const isMatch = await ctx.llm.generateObject({
   *     schema: z.object({ matches: z.boolean(), reason: z.string() }),
   *     prompt: `Does this email match the rule criteria?`,
   *   });
   *   return { matches: isMatch.object.matches, reason: isMatch.object.reason };
   * }
   * ```
   */
  evaluateRule?(ctx: RuleContext): Promise<RuleResult | null>;

  /**
   * Follow-up detection hook.
   * Called to determine if an email needs follow-up.
   *
   * Requires capability: followup:detect
   *
   * @returns FollowupResult with detection status and suggested date
   *
   * @example
   * ```typescript
   * async detectFollowup(ctx) {
   *   if (ctx.email.snippet.includes('please respond by')) {
   *     return {
   *       needsFollowup: true,
   *       confidence: 0.9,
   *       suggestedDate: extractDate(ctx.email.snippet),
   *       reason: 'Email contains explicit response deadline',
   *     };
   *   }
   *   return { needsFollowup: false, confidence: 0.8 };
   * }
   * ```
   */
  detectFollowup?(ctx: EmailContext): Promise<FollowupResult | null>;

  /**
   * Calendar event hook - called when calendar events occur.
   * Use this to react to calendar events (meetings, reminders, etc.).
   *
   * Requires capability: calendar:read
   *
   * @example
   * ```typescript
   * async onCalendarEvent(ctx) {
   *   if (ctx.event.attendees?.some(a => a.responseStatus === 'needsAction')) {
   *     await ctx.emailSender?.send({
   *       to: ctx.event.attendees.filter(a => a.responseStatus === 'needsAction').map(a => a.email),
   *       subject: `Reminder: Please RSVP for ${ctx.event.summary}`,
   *       body: 'Please confirm your attendance.',
   *     });
   *   }
   * }
   * ```
   */
  onCalendarEvent?(ctx: CalendarContext): Promise<void>;

  /**
   * Chat tools that extend the main Inbox Zero assistant.
   * These tools become available to the AI during chat conversations.
   *
   * Requires capability: chat:tool
   *
   * @example
   * ```typescript
   * chatTools: {
   *   "search-contacts": {
   *     description: "Search CRM for contact information",
   *     parameters: z.object({ query: z.string() }),
   *     execute: async (params, ctx) => {
   *       return await searchCRM(params.query);
   *     },
   *   },
   * }
   * ```
   */
  chatTools?: PluginChatTools;

  /**
   * Context to inject into the assistant's system prompt.
   * Use this to customize assistant behavior, add knowledge, or set tone.
   *
   * Requires capability: chat:context
   *
   * @example
   * ```typescript
   * chatContext: {
   *   instructions: "You are also a wellness coach.",
   *   knowledge: ["User prefers brief responses"],
   *   tone: "friendly",
   * }
   * ```
   */
  chatContext?: PluginChatContext;
}
