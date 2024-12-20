import { z } from "zod";
import { GroupName } from "@/utils/config";
import { ActionType, RuleType } from "@prisma/client";

export const createRuleSchema = z.object({
  name: z
    .string()
    .describe("The name of the rule. No need to include 'Rule' in the name."),
  condition: z
    .object({
      type: z
        .enum([RuleType.AI, RuleType.STATIC, RuleType.GROUP])
        .describe("The type of the condition"),

      aiInstructions: z
        .string()
        .optional()
        .describe(
          "Instructions for the AI to determine when to apply this rule. For example: 'Apply this rule to emails about product updates' or 'Use this rule for messages discussing project deadlines'. Be specific about the email content or characteristics that should trigger this rule. Leave blank if using static conditions or groups.",
        ),
      static: z
        .object({
          from: z
            .string()
            .optional()
            .describe("The from email address to match"),
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
    .describe("The conditions to match"),
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
          })
          .optional()
          .describe(
            "The fields to use for the action. Static text can be combined with dynamic values using double braces {{}}. For example: 'Hi {{sender's name}}' or 'Re: {{subject}}' or '{{when I'm available for a meeting}}'. Dynamic values will be replaced with actual email data when the rule is executed. Dynamic values are generated in real time by the AI. Only use dynamic values where absolutely necessary. Otherwise, use plain static text. A field can be also be fully static or fully dynamic.",
          ),
      }),
    )
    .describe("The actions to take"),
});
