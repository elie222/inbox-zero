import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import {
  getAvailableActionsForRuleEditor,
  getExtraAvailableActionsForRuleEditor,
} from "@/utils/ai/rule/action-availability";
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
  return getAvailableActionsForRuleEditor({ provider }) as [
    ActionType,
    ...ActionType[],
  ];
}

export const getExtraActions = (existingActionTypes: ActionType[] = []) =>
  getExtraAvailableActionsForRuleEditor(existingActionTypes);

export type RuleActionFields = {
  label?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  content?: string | null;
  webhookUrl?: string | null;
  folderName?: string | null;
};

export type RuleAction = {
  type: ActionType;
  fields?: RuleActionFields | null;
  delayInMinutes?: number | null;
};

export const createRuleActionSchema = (
  provider: string,
): z.ZodType<RuleAction> => {
  const allowedTypes = [
    ...getAvailableActionsForRuleEditor({ provider }),
    ...getExtraAvailableActionsForRuleEditor(),
  ] as [ActionType, ...ActionType[]];

  return z
    .object({
      type: z
        .enum(allowedTypes)
        .describe(
          "The action type. LABEL requires fields.label. FORWARD and SEND_EMAIL require fields.to. CALL_WEBHOOK requires fields.webhookUrl. MOVE_FOLDER requires fields.folderName (Microsoft only).",
        ),
      fields: z
        .object(createActionFieldShape(provider))
        .nullish()
        .describe(
          "Action-specific fields. Provide only the fields required for the chosen action type.",
        ),
      delayInMinutes: delayInMinutesLlmSchema,
    })
    .superRefine((data, ctx) => {
      const f = data.fields;
      if (data.type === ActionType.LABEL && !f?.label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "LABEL requires fields.label.",
          path: ["fields", "label"],
        });
      }
      if (
        (data.type === ActionType.SEND_EMAIL ||
          data.type === ActionType.FORWARD) &&
        !f?.to
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fields.to is required.",
          path: ["fields", "to"],
        });
      }
      if (data.type === ActionType.CALL_WEBHOOK && !f?.webhookUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CALL_WEBHOOK requires fields.webhookUrl.",
          path: ["fields", "webhookUrl"],
        });
      }
      if (data.type === ActionType.MOVE_FOLDER && !f?.folderName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MOVE_FOLDER requires fields.folderName.",
          path: ["fields", "folderName"],
        });
      }
    }) as z.ZodType<RuleAction>;
};

export const createRuleSchema = (provider: string) =>
  z.object({
    name: z
      .string()
      .describe(
        "A short, concise name for the rule (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.",
      ),
    condition: conditionSchema,
    actions: z
      .array(createRuleActionSchema(provider))
      .describe("The actions to take"),
  });

export type CreateRuleSchema = z.infer<ReturnType<typeof createRuleSchema>>;
export type CreateOrUpdateRuleSchema = CreateRuleSchema & {
  ruleId?: string;
};

function createActionFieldShape(provider: string) {
  return {
    label: optionalStringField("The label to apply to the email"),
    to: optionalStringField(
      "The recipient email address. Required for SEND_EMAIL and FORWARD. Use REPLY when responding to the triggering inbound email.",
    ),
    cc: optionalStringField("The cc email address to send the email to"),
    bcc: optionalStringField("The bcc email address to send the email to"),
    subject: optionalStringField("The subject of the email"),
    content: optionalStringField("The content of the email"),
    webhookUrl: optionalStringField("The webhook URL to call"),
    ...(isMicrosoftProvider(provider) && {
      folderName: optionalStringField("The folder to move the email to"),
    }),
  };
}

function optionalStringField(description: string) {
  return z
    .string()
    .nullish()
    .transform((value) => value ?? null)
    .describe(description);
}
