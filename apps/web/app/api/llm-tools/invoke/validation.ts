import { z } from "zod";

/**
 * Available tools that can be invoked via the LLM tool proxy.
 * These map to the tools defined in utils/ai/assistant/chat.ts
 */
export const toolNameSchema = z.enum([
  "getUserRulesAndSettings",
  "getLearnedPatterns",
  "createRule",
  "updateRuleConditions",
  "updateRuleActions",
  "updateLearnedPatterns",
  "updateAbout",
  "addToKnowledgeBase",
]);

export type ToolName = z.infer<typeof toolNameSchema>;

/**
 * Request body schema for the LLM tool proxy endpoint.
 */
export const invokeToolRequestSchema = z.object({
  tool: toolNameSchema,
  input: z.record(z.unknown()).default({}),
  /** User email to identify the account (looked up to get emailAccountId internally) */
  userEmail: z.string().email("Valid email is required"),
});

export type InvokeToolRequest = z.infer<typeof invokeToolRequestSchema>;

/**
 * Success response from tool invocation.
 */
export interface InvokeToolSuccessResponse {
  success: true;
  result: unknown;
}

/**
 * Error response from tool invocation.
 */
export interface InvokeToolErrorResponse {
  success: false;
  error: string;
  code:
    | "UNAUTHORIZED"
    | "INVALID_TOOL"
    | "VALIDATION_ERROR"
    | "EXECUTION_ERROR"
    | "EMAIL_NOT_FOUND";
}

export type InvokeToolResponse =
  | InvokeToolSuccessResponse
  | InvokeToolErrorResponse;

/**
 * Input schemas for tools that don't have inline validation.
 */
export const getLearnedPatternsInputSchema = z.object({
  ruleName: z.string().min(1, "Rule name is required"),
});
export type GetLearnedPatternsInput = z.infer<
  typeof getLearnedPatternsInputSchema
>;

export const updateAboutInputSchema = z.object({
  about: z.string().min(1, "About content is required"),
});
export type UpdateAboutInput = z.infer<typeof updateAboutInputSchema>;

export const addToKnowledgeBaseInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});
export type AddToKnowledgeBaseInput = z.infer<
  typeof addToKnowledgeBaseInputSchema
>;
