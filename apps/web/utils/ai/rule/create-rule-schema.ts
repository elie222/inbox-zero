import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { isDefined } from "@/utils/types";
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
  const availableActions = getAvailableActionsForRuleEditor({
    provider,
  }).filter(isDefined);
  return availableActions as [ActionType, ...ActionType[]];
}

export const getExtraActions = () => getExtraAvailableActionsForRuleEditor();

export const createRuleActionSchema = (provider: string) => {
  const allowedActionTypes = new Set([
    ...getAvailableActionsForRuleEditor({ provider }),
    ...getExtraAvailableActionsForRuleEditor(),
  ]);
  const optionalFieldsSchema = createOptionalActionFieldsSchema(provider);

  const actionSchemas: [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]] = [
    createActionObjectSchema(ActionType.ARCHIVE, optionalFieldsSchema),
    createActionObjectSchema(
      ActionType.LABEL,
      createRequiredLabelFieldsSchema(provider),
    ),
    createActionObjectSchema(ActionType.MARK_READ, optionalFieldsSchema),
    createActionObjectSchema(ActionType.MARK_SPAM, optionalFieldsSchema),
    createActionObjectSchema(ActionType.DIGEST, optionalFieldsSchema),
    ...(allowedActionTypes.has(ActionType.DRAFT_EMAIL)
      ? [createActionObjectSchema(ActionType.DRAFT_EMAIL, optionalFieldsSchema)]
      : []),
    ...(allowedActionTypes.has(ActionType.REPLY)
      ? [createActionObjectSchema(ActionType.REPLY, optionalFieldsSchema)]
      : []),
    ...(allowedActionTypes.has(ActionType.FORWARD)
      ? [
          createActionObjectSchema(
            ActionType.FORWARD,
            createRequiredRecipientFieldsSchema(provider),
          ),
        ]
      : []),
    ...(allowedActionTypes.has(ActionType.SEND_EMAIL)
      ? [
          createActionObjectSchema(
            ActionType.SEND_EMAIL,
            createRequiredRecipientFieldsSchema(provider),
          ),
        ]
      : []),
    ...(allowedActionTypes.has(ActionType.CALL_WEBHOOK)
      ? [
          createActionObjectSchema(
            ActionType.CALL_WEBHOOK,
            createRequiredWebhookFieldsSchema(provider),
          ),
        ]
      : []),
    ...(allowedActionTypes.has(ActionType.MOVE_FOLDER)
      ? [
          createActionObjectSchema(
            ActionType.MOVE_FOLDER,
            createRequiredFolderFieldsSchema(provider),
          ),
        ]
      : []),
  ];

  return z.union(actionSchemas);
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

function createActionObjectSchema(type: ActionType, fields: z.ZodTypeAny) {
  return z.object({
    type: z.literal(type),
    fields,
    delayInMinutes: delayInMinutesLlmSchema,
  });
}

function createOptionalActionFieldsSchema(provider: string) {
  return z.object(createActionFieldShape(provider)).nullish();
}

function createRequiredLabelFieldsSchema(provider: string) {
  return z.object({
    ...createActionFieldShape(provider),
    label: requiredStringField(
      "The label to apply to the email",
      "LABEL requires fields.label.",
    ),
  });
}

function createRequiredRecipientFieldsSchema(provider: string) {
  return z.object({
    ...createActionFieldShape(provider),
    to: requiredStringField(
      "The recipient email address. Required for SEND_EMAIL and FORWARD. Use REPLY when responding to the triggering inbound email.",
      "fields.to is required.",
    ),
  });
}

function createRequiredWebhookFieldsSchema(provider: string) {
  return z.object({
    ...createActionFieldShape(provider),
    webhookUrl: requiredStringField(
      "The webhook URL to call",
      "CALL_WEBHOOK requires fields.webhookUrl.",
    ),
  });
}

function createRequiredFolderFieldsSchema(provider: string) {
  const fieldShape = createActionFieldShape(provider);

  if (!("folderName" in fieldShape)) {
    throw new Error("MOVE_FOLDER is only supported for Microsoft providers.");
  }

  return z.object({
    ...fieldShape,
    folderName: requiredStringField(
      "The folder to move the email to",
      "MOVE_FOLDER requires fields.folderName.",
    ),
  });
}

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

function requiredStringField(description: string, message: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine(Boolean, message)
    .describe(description);
}
