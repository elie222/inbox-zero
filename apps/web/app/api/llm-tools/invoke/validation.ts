import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { delayInMinutesSchema } from "@/utils/actions/rule.validation";

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

/**
 * Input schema for updateRuleConditions tool.
 */
export const updateRuleConditionsInputSchema = z.object({
  ruleName: z.string(),
  condition: z.object({
    aiInstructions: z.string().optional(),
    static: z
      .object({
        from: z.string().nullish(),
        to: z.string().nullish(),
        subject: z.string().nullish(),
      })
      .nullish(),
    conditionalOperator: z
      .enum([LogicalOperator.AND, LogicalOperator.OR])
      .nullish(),
  }),
});
export type UpdateRuleConditionsInput = z.infer<
  typeof updateRuleConditionsInputSchema
>;

/**
 * Input schema for updateRuleActions tool.
 */
export const updateRuleActionsInputSchema = z.object({
  ruleName: z.string(),
  actions: z.array(
    z.object({
      type: z.enum([
        ActionType.ARCHIVE,
        ActionType.LABEL,
        ActionType.DRAFT_EMAIL,
        ActionType.FORWARD,
        ActionType.REPLY,
        ActionType.SEND_EMAIL,
        ActionType.MARK_READ,
        ActionType.MARK_SPAM,
        ActionType.CALL_WEBHOOK,
        ActionType.DIGEST,
      ]),
      fields: z.object({
        label: z.string().nullish(),
        content: z.string().nullish(),
        webhookUrl: z.string().nullish(),
        to: z.string().nullish(),
        cc: z.string().nullish(),
        bcc: z.string().nullish(),
        subject: z.string().nullish(),
        folderName: z.string().nullish(),
      }),
      delayInMinutes: delayInMinutesSchema,
    }),
  ),
});
export type UpdateRuleActionsInput = z.infer<
  typeof updateRuleActionsInputSchema
>;

/**
 * Input schema for updateLearnedPatterns tool.
 */
export const updateLearnedPatternsInputSchema = z.object({
  ruleName: z.string(),
  learnedPatterns: z
    .array(
      z.object({
        include: z
          .object({
            from: z.string().optional(),
            subject: z.string().optional(),
          })
          .optional(),
        exclude: z
          .object({
            from: z.string().optional(),
            subject: z.string().optional(),
          })
          .optional(),
      }),
    )
    .min(1, "At least one learned pattern is required"),
});
export type UpdateLearnedPatternsInput = z.infer<
  typeof updateLearnedPatternsInputSchema
>;
