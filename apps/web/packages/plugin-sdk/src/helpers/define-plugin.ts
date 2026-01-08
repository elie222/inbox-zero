import type { InboxZeroPlugin } from "../types/plugin";

/**
 * Helper function to define a plugin with full type inference.
 *
 * Using definePlugin() provides:
 * - Full TypeScript autocompletion for all hook methods
 * - Type checking for context parameters and return types
 * - IDE support for navigating to type definitions
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
 *
 * @param plugin - The plugin implementation
 * @returns The same plugin object with proper typing
 */
export function definePlugin<T extends InboxZeroPlugin>(plugin: T): T {
  return plugin;
}

/**
 * Type helper for extracting the plugin type from definePlugin.
 * Useful for testing and advanced type manipulation.
 *
 * @example
 * ```typescript
 * const myPlugin = definePlugin({ ... });
 * type MyPlugin = PluginType<typeof myPlugin>;
 * ```
 */
export type PluginType<T extends InboxZeroPlugin> = T;

/**
 * Type helper for partial plugin implementations.
 * Useful when building plugins incrementally or testing individual hooks.
 *
 * @example
 * ```typescript
 * const partialPlugin: PartialPlugin = {
 *   classifyEmail: async (ctx) => ({ label: 'Test', confidence: 1 }),
 * };
 * ```
 */
export type PartialPlugin = Partial<InboxZeroPlugin>;
