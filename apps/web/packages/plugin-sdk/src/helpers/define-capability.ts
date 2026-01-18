import type { CapabilityHandler } from "../types/capability";

/**
 * Helper function to define a capability handler with full type inference.
 *
 * Using defineCapability() provides:
 * - Full TypeScript autocompletion for all handler properties
 * - Type checking for context parameters and return types
 * - Runtime validation of required fields
 * - IDE support for navigating to type definitions
 *
 * @example
 * ```typescript
 * import { defineCapability } from '@inbox-zero/plugin-sdk';
 *
 * export const meetingScheduler = defineCapability({
 *   id: 'meeting-scheduler',
 *   name: 'Meeting Scheduler',
 *   description: 'Handles meeting requests and scheduling emails',
 *   routingHints: ['meeting', 'schedule', 'calendar', 'invite'],
 *   requires: ['calendar'],
 *
 *   async canHandle(ctx) {
 *     const text = `${ctx.email.subject} ${ctx.email.snippet}`.toLowerCase();
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
 * });
 * ```
 *
 * @param capability - The capability handler implementation
 * @returns The same capability handler object with proper typing
 * @throws Error if required fields are missing
 */
export function defineCapability<T extends CapabilityHandler>(
  capability: T,
): T {
  // validate required fields
  if (!capability.id) {
    throw new Error("Capability must have an id");
  }
  if (!capability.name) {
    throw new Error("Capability must have a name");
  }
  if (!capability.description) {
    throw new Error("Capability must have a description");
  }
  if (!capability.routingHints || capability.routingHints.length === 0) {
    throw new Error("Capability must have at least one routing hint");
  }
  if (typeof capability.execute !== "function") {
    throw new Error("Capability must have an execute function");
  }

  return capability;
}

/**
 * Type helper for extracting the capability type from defineCapability.
 * Useful for testing and advanced type manipulation.
 *
 * @example
 * ```typescript
 * const myCapability = defineCapability({ ... });
 * type MyCapability = CapabilityType<typeof myCapability>;
 * ```
 */
export type CapabilityType<T extends CapabilityHandler> = T;

/**
 * Type helper for partial capability implementations.
 * Useful when building capabilities incrementally or testing individual methods.
 *
 * @example
 * ```typescript
 * const partialCapability: PartialCapability = {
 *   id: 'test-capability',
 *   name: 'Test',
 *   description: 'A test capability',
 *   routingHints: ['test'],
 *   execute: async (ctx) => ({
 *     handled: true,
 *     explanation: { summary: 'Test executed' },
 *   }),
 * };
 * ```
 */
export type PartialCapability = Partial<CapabilityHandler>;
