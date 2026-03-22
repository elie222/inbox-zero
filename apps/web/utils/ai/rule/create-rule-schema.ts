import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { isDefined } from "@/utils/types";
import { env } from "@/env";
import { addMissingRecipientIssue } from "@/utils/rule/recipient-validation";
import { delayInMinutesLlmSchema } from "@/utils/actions/rule.validation";
import {
  AI_INSTRUCTIONS_PROMPT_DESCRIPTION,
  INVALID_STATIC_FROM_MESSAGE,
  isInvalidStaticFromValue,
  STATIC_FROM_CONDITION_DESCRIPTION,
} from "@/utils/ai/rule/rule-condition-descriptions";

const conditionSchema = z
  .object({
    conditionalOperator: z
      .enum([LogicalOperator.AND, LogicalOperator.OR])
      .nullable()
      .describe(
        "The conditional operator to use. AND means all conditions must be true for the rule to match. OR means any condition can be true for the rule to match. This does not impact sub-conditions.",
      ),
    aiInstructions: z
      .string()
      .nullish()
      .transform((v) => (v?.trim() ? v : null))
      .describe(AI_INSTRUCTIONS_PROMPT_DESCRIPTION),
    static: z
      .object({
        from: z
          .string()
          .nullish()
          .transform((v) => (v?.trim() ? v : null))
          .refine((value) => !isInvalidStaticFromValue(value), {
            message: INVALID_STATIC_FROM_MESSAGE,
          })
          .describe(STATIC_FROM_CONDITION_DESCRIPTION),
        to: z.string().nullish().describe("The to email address to match"),
        subject: z.string().nullish().describe("The subject to match"),
      })
      .nullish()
      .describe(
        "The static conditions to match. If multiple static conditions are specified, the rule will match if ALL of the conditions match (AND operation)",
      ),
  })
  .describe("The conditions to match");

export function getAvailableActions(provider: string) {
  const availableActions: ActionType[] = [
    ActionType.LABEL,
    ...(isMicrosoftProvider(provider) ? [ActionType.MOVE_FOLDER] : []),
    ActionType.ARCHIVE,
    ActionType.MARK_READ,
    ...(env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED ? [] : [ActionType.DRAFT_EMAIL]),
    // Only include send-related actions when email sending is enabled
    ...(env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
      ? [ActionType.REPLY, ActionType.FORWARD, ActionType.SEND_EMAIL]
      : []),
    ActionType.MARK_SPAM,
  ].filter(isDefined);
  return availableActions as [ActionType, ...ActionType[]];
}

export const getExtraActions = () => [
  ActionType.DIGEST,
  ActionType.CALL_WEBHOOK,
];

const actionSchema = (provider: string) =>
  z
    .object({
      type: z
        .enum([...getAvailableActions(provider), ...getExtraActions()])
        .describe(
          `The type of the action. '${ActionType.DIGEST}' means emails will be added to the digest email the user receives. ${isMicrosoftProvider(provider) ? `'${ActionType.LABEL}' means emails will be categorized in Outlook.` : ""}`,
        ),
      fields: z
        .object({
          label: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe("The label to apply to the email"),
          to: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe(
              "The recipient email address. Required for SEND_EMAIL and FORWARD. Use REPLY when responding to the triggering inbound email.",
            ),
          cc: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe("The cc email address to send the email to"),
          bcc: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe("The bcc email address to send the email to"),
          subject: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe("The subject of the email"),
          content: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe("The content of the email"),
          webhookUrl: z
            .string()
            .nullable()
            .transform((v) => v ?? null)
            .describe("The webhook URL to call"),
          ...(isMicrosoftProvider(provider) && {
            folderName: z
              .string()
              .nullable()
              .transform((v) => v ?? null)
              .describe("The folder to move the email to"),
          }),
        })
        .nullable()
        .describe(
          "The fields to use for the action. Static text can be combined with dynamic values using double braces {{}}. For example: 'Hi {{sender's name}}' or 'Re: {{subject}}' or '{{when I'm available for a meeting}}'. Dynamic values will be replaced with actual email data when the rule is executed. Dynamic values are generated in real time by the AI. Only use dynamic values where absolutely necessary. Otherwise, use plain static text. A field can be also be fully static or fully dynamic.",
        ),
      delayInMinutes: delayInMinutesLlmSchema,
    })
    .superRefine((action, ctx) => {
      addMissingRecipientIssue({
        actionType: action.type,
        recipient: action.fields?.to,
        ctx,
        path: ["fields", "to"],
        sendEmailMessage:
          "SEND_EMAIL requires a recipient in fields.to. Use REPLY for auto-responses.",
        forwardMessage: "FORWARD requires a recipient in fields.to.",
      });
    });

export const createRuleSchema = (provider: string) =>
  z.object({
    name: z
      .string()
      .describe(
        "A short, concise name for the rule (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.",
      ),
    condition: conditionSchema,
    actions: z.array(actionSchema(provider)).describe("The actions to take"),
  });

export type CreateRuleSchema = z.infer<ReturnType<typeof createRuleSchema>>;
export type CreateOrUpdateRuleSchema = CreateRuleSchema & {
  ruleId?: string;
};
