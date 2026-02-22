import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { isDefined } from "@/utils/types";
import { env } from "@/env";
import { NINETY_DAYS_MINUTES } from "@/utils/date";
import { getMissingRecipientMessage } from "@/utils/rule/recipient-validation";

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
      .nullable()
      .describe(
        "Instructions for the AI to determine when to apply this rule. For example: 'Apply this rule to emails about product updates' or 'Use this rule for messages discussing project deadlines'. Be specific about the email content or characteristics that should trigger this rule.",
      ),
    static: z
      .object({
        from: z.string().nullable().describe("The from email address to match"),
        to: z.string().nullable().describe("The to email address to match"),
        subject: z.string().nullable().describe("The subject to match"),
      })
      .nullable()
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
    ActionType.DRAFT_EMAIL,
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
      delayInMinutes: z
        .number()
        .min(1, "Minimum supported delay is 1 minute")
        .max(NINETY_DAYS_MINUTES, "Maximum supported delay is 90 days")
        .nullable(),
    })
    .superRefine((action, ctx) => {
      const recipientMessage = getMissingRecipientMessage({
        actionType: action.type,
        recipient: action.fields?.to,
        sendEmailMessage:
          "SEND_EMAIL requires a recipient in fields.to. Use REPLY for auto-responses.",
        forwardMessage: "FORWARD requires a recipient in fields.to.",
      });

      if (recipientMessage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: recipientMessage,
          path: ["fields", "to"],
        });
      }
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
