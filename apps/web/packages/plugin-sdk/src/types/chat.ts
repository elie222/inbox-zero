import type { z } from "zod";
import type { PluginEmailAccount } from "./contexts";
import type { PluginStorage } from "./storage";
import type { PluginLLM } from "./llm";

/**
 * Context provided to plugin chat tools during execution
 */
export interface ChatToolContext {
  /** Email account information */
  emailAccount: PluginEmailAccount;

  /** Plugin storage for persisting data */
  storage: PluginStorage;

  /** LLM access for AI operations */
  llm: PluginLLM;
}

/**
 * Definition of a chat tool that plugins can provide
 *
 * @example
 * ```typescript
 * export default definePlugin({
 *   chatTools: {
 *     "search-contacts": {
 *       description: "Search CRM for contact information",
 *       parameters: z.object({
 *         query: z.string().describe("Search query"),
 *       }),
 *       execute: async (params, ctx) => {
 *         const results = await searchCRM(params.query);
 *         return { contacts: results };
 *       },
 *     },
 *   },
 * });
 * ```
 */
export interface PluginChatTool<TParams = unknown, TResult = unknown> {
  /** Human-readable description of what the tool does */
  description: string;

  /** Zod schema defining the tool's parameters */
  parameters: z.ZodSchema<TParams>;

  /** Execute the tool with the given parameters */
  execute: (params: TParams, ctx: ChatToolContext) => Promise<TResult>;
}

/**
 * Chat context that plugins can inject into the assistant's system prompt
 *
 * @example
 * ```typescript
 * export default definePlugin({
 *   chatContext: {
 *     instructions: "You are also a wellness coach. Encourage healthy email habits.",
 *     knowledge: [
 *       "User prefers to batch email checking twice daily",
 *       "Important contacts: CEO (urgent), Family (high priority)",
 *     ],
 *     tone: "friendly and encouraging",
 *   },
 * });
 * ```
 */
export interface PluginChatContext {
  /**
   * Additional instructions to add to the assistant's behavior.
   * These are appended to the system prompt.
   */
  instructions?: string;

  /**
   * Knowledge facts the assistant should be aware of.
   * These are included in the system prompt as context.
   */
  knowledge?: string[];

  /**
   * Preferred tone/style for the assistant's responses.
   * Examples: "professional", "friendly", "concise"
   */
  tone?: string;
}

/**
 * Record of chat tools keyed by tool name.
 * Tool names should be kebab-case and descriptive.
 */
export type PluginChatTools = Record<string, PluginChatTool>;
