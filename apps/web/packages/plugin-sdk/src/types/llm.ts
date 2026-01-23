import type { z } from "zod";

/**
 * Options for generating text using the plugin LLM.
 */
export interface GenerateTextOptions {
  /**
   * The prompt to send to the LLM.
   */
  prompt: string;
  /**
   * Optional system message to set context for the LLM.
   */
  system?: string;
}

/**
 * Options for generating a structured object using the plugin LLM.
 */
export interface GenerateObjectOptions<T> {
  /**
   * The prompt to send to the LLM.
   */
  prompt: string;
  /**
   * Zod schema defining the expected structure of the response.
   * The LLM will be instructed to return data matching this schema.
   */
  schema: z.ZodSchema<T>;
  /**
   * Optional system message to set context for the LLM.
   */
  system?: string;
}

/**
 * Result of a structured object generation request.
 */
export interface GenerateObjectResult<T> {
  /**
   * The generated object matching the provided schema.
   */
  object: T;
}

/**
 * LLM tier for model selection.
 */
export type LLMTier = "economy" | "chat" | "reasoning";

/**
 * Options for generating text with MCP tools available.
 * Requires mcp:access capability.
 */
export interface GenerateTextWithToolsOptions {
  /**
   * The prompt to send to the LLM.
   */
  prompt: string;
  /**
   * Optional system message to set context for the LLM.
   */
  system?: string;
  /**
   * LLM tier for model selection (default: 'chat').
   */
  tier?: LLMTier;
  /**
   * Maximum number of tool execution steps (default: 5, max: 10).
   */
  maxSteps?: number;
}

/**
 * Result of a tool call during generation.
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
 * Result of text generation with tools.
 */
export interface GenerateTextWithToolsResult {
  /** The final generated text after tool execution */
  text: string;
  /** Tool calls made during generation */
  toolCalls: ToolCallResult[];
}

/**
 * Plugin LLM interface for accessing language model capabilities.
 *
 * Plugins do not choose which model to use - the `llm.tier` field in plugin.json
 * determines the model class (default/economy/chat).
 *
 * @example
 * ```typescript
 * // Generate plain text
 * const summary = await ctx.llm.generateText({
 *   prompt: 'Summarize this email thread',
 *   system: 'You are a helpful email assistant',
 * });
 *
 * // Generate a structured object
 * const result = await ctx.llm.generateObject({
 *   prompt: 'Analyze if this email needs follow-up',
 *   schema: z.object({
 *     needsFollowup: z.boolean(),
 *     reason: z.string(),
 *     urgency: z.enum(['low', 'medium', 'high']),
 *   }),
 * });
 * console.log(result.object.needsFollowup);
 * ```
 */
export interface PluginLLM {
  /**
   * Generate text from a prompt.
   *
   * @param options - Generation options including prompt and optional system message
   * @returns The generated text response
   */
  generateText(options: GenerateTextOptions): Promise<string>;

  /**
   * Generate a structured object from a prompt using a Zod schema.
   *
   * The LLM will be instructed to return JSON matching the provided schema.
   * The response is validated against the schema before being returned.
   *
   * @param options - Generation options including prompt, schema, and optional system message
   * @returns Object containing the generated data matching the schema
   */
  generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<GenerateObjectResult<T>>;

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
   *
   * @example
   * ```typescript
   * const result = await ctx.llm.generateTextWithTools({
   *   prompt: `Look up customer ${email.from} in our CRM`,
   *   system: 'Use available tools to research the customer',
   *   maxSteps: 3,
   * });
   *
   * console.log(result.text);  // LLM response with tool context
   * console.log(result.toolCalls);  // Tools that were used
   * ```
   */
  generateTextWithTools?(
    options: GenerateTextWithToolsOptions,
  ): Promise<GenerateTextWithToolsResult>;
}
