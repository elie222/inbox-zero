/**
 * Example Capability Handlers
 *
 * This module exports real-world capability handler examples that demonstrate
 * best practices for building Inbox Zero plugins. Each example shows:
 *
 * - Proper use of routing hints for intelligent email routing
 * - LLM structured output with Zod schemas
 * - Context-aware operations (storage, calendar, email operations)
 * - Transparent explanations for users
 * - Error handling patterns
 *
 * @example Using an example as a starting point
 * ```typescript
 * import { meetingScheduler } from '@inbox-zero/plugin-sdk/examples';
 *
 * // Register the capability with your plugin
 * export default definePlugin({
 *   capabilities: [meetingScheduler],
 * });
 * ```
 *
 * @example Customizing an example
 * ```typescript
 * import { defineCapability } from '@inbox-zero/plugin-sdk';
 * import { meetingScheduler } from '@inbox-zero/plugin-sdk/examples';
 *
 * // Extend with custom behavior
 * export const customScheduler = defineCapability({
 *   ...meetingScheduler,
 *   id: 'custom-meeting-scheduler',
 *   routingHints: [...meetingScheduler.routingHints, 'standup', 'sync'],
 * });
 * ```
 */

export { meetingScheduler } from "./meeting-scheduler";
export { receiptProcessor } from "./receipt-processor";
export { newsletterManager } from "./newsletter-manager";
export { followUpTracker } from "./follow-up-tracker";
export { travelItinerary } from "./travel-itinerary";

/**
 * All example capabilities as an array for easy iteration
 */
export const allExamples = [
  "meetingScheduler",
  "receiptProcessor",
  "newsletterManager",
  "followUpTracker",
  "travelItinerary",
] as const;

export type ExampleName = (typeof allExamples)[number];
