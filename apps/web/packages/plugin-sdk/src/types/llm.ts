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
}
