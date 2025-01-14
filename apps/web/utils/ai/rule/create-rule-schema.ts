import { z } from "zod";
import { GroupName } from "@/utils/config";
import { ActionType, CategoryFilterType, RuleType } from "@prisma/client";

const typeSchema = z.enum([RuleType.AI, RuleType.STATIC, RuleType.GROUP]);
const allTypesSchema = z.enum([
  RuleType.AI,
  RuleType.STATIC,
  RuleType.GROUP,
  RuleType.CATEGORY,
]);

const conditionSchema = z
  .object({
    aiInstructions: z
      .string()
      .optional()
      .describe(
        "Instructions for the AI to determine when to apply this rule. For example: 'Apply this rule to emails about product updates' or 'Use this rule for messages discussing project deadlines'. Be specific about the email content or characteristics that should trigger this rule. Leave blank if using static conditions or groups.",
      ),
    static: z
      .object({
        from: z.string().optional().describe("The from email address to match"),
        to: z.string().optional().describe("The to email address to match"),
        subject: z
          .string()
          .optional()
          .describe(
            "The subject to match. Leave blank if AI is required to process the subject line.",
          ),
      })
      .optional()
      .describe("The static conditions to match"),
    group: z
      .enum([GroupName.RECEIPT, GroupName.NEWSLETTER])
      .optional()
      .describe(
        "The group to match. Only 'Receipt' and 'Newsletter' are supported.",
      ),
  })
  .describe("The conditions to match");

export const createRuleSchema = z.object({
  name: z
    .string()
    .describe("The name of the rule. No need to include 'Rule' in the name."),
  condition: conditionSchema
    .extend({
      type: typeSchema.optional().describe("The type of the condition"),
    })
    .transform((condition) => ({
      ...condition,
      type: determineRuleType(condition),
    })),
  actions: z
    .array(
      z.object({
        type: z.nativeEnum(ActionType).describe("The type of the action"),
        fields: z
          .object({
            label: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The label to apply to the email"),
            to: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The to email address to send the email to"),
            cc: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The cc email address to send the email to"),
            bcc: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The bcc email address to send the email to"),
            subject: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The subject of the email"),
            content: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The content of the email"),
            webhookUrl: z
              .string()
              .nullish()
              .transform((v) => v ?? null)
              .describe("The webhook URL to call"),
          })
          .optional()
          .describe(
            "The fields to use for the action. Static text can be combined with dynamic values using double braces {{}}. For example: 'Hi {{sender's name}}' or 'Re: {{subject}}' or '{{when I'm available for a meeting}}'. Dynamic values will be replaced with actual email data when the rule is executed. Dynamic values are generated in real time by the AI. Only use dynamic values where absolutely necessary. Otherwise, use plain static text. A field can be also be fully static or fully dynamic.",
          ),
      }),
    )
    .describe("The actions to take"),
});

export const createRuleSchemaWithCategories = createRuleSchema.extend({
  condition: conditionSchema
    .extend({
      type: allTypesSchema.optional().describe("The type of the condition"),
      categoryFilterType: z
        .enum([CategoryFilterType.INCLUDE, CategoryFilterType.EXCLUDE])
        .optional()
        .describe(
          "Whether senders in this categoryFilters should be included or excluded",
        ),
      categoryFilters: z
        .array(z.string())
        .optional()
        .describe("The categories to match"),
    })
    .transform((condition) => ({
      ...condition,
      type: determineRuleType(condition),
    })),
});

// For some reason OpenAI was skipping the type field in the schema.
// This function is a workaround to determine the rule type, and the type field is now optional.
const determineRuleType = (condition: {
  type?: RuleType;
  aiInstructions?: string;
  static?: Record<string, string>;
  group?: string;
  categoryFilters?: string[];
}) => {
  if (condition.type) return condition.type;
  if (condition.aiInstructions) return RuleType.AI;
  if (
    condition.static?.from ||
    condition.static?.to ||
    condition.static?.subject
  )
    return RuleType.STATIC;
  if (condition.group) return RuleType.GROUP;
  if (condition.categoryFilters?.length) return RuleType.CATEGORY;
};
