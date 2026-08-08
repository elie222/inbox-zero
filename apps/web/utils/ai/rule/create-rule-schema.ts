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
import { strictOptional } from "@/utils/llms/strict-optional";

const conditionalOperatorSchema = strictOptional(
  z.enum([LogicalOperator.AND, LogicalOperator.OR]),
).describe(
  "The conditional operator to use. AND means all conditions must be true for the rule to match. OR means any condition can be true for the rule to match. This does not impact sub-conditions.",
);

const optionalAiInstructionsSchema = optionalFromNullable(z.string())
  .transform((v) => (v?.trim() ? v : null))
  .describe(AI_INSTRUCTIONS_PROMPT_DESCRIPTION);

const requiredAiInstructionsSchema = z
  .string()
  .trim()
  .min(1)
  .describe(AI_INSTRUCTIONS_PROMPT_DESCRIPTION);

const optionalStaticFromSchema = optionalFromNullable(z.string())
  .transform((v) => (v?.trim() ? v : null))
  .refine((value) => !isInvalidStaticFromValue(value), {
    message: INVALID_STATIC_FROM_MESSAGE,
  })
  .describe(STATIC_FROM_CONDITION_DESCRIPTION);

const requiredStaticFromSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !isInvalidStaticFromValue(value), {
    message: INVALID_STATIC_FROM_MESSAGE,
  })
  .describe(STATIC_FROM_CONDITION_DESCRIPTION);

const optionalStaticToSchema = optionalFromNullable(z.string()).describe(
  "The to email address to match",
);

const requiredStaticToSchema = z
  .string()
  .trim()
  .min(1)
  .describe("The to email address to match");

const optionalStaticSubjectSchema = optionalFromNullable(z.string()).describe(
  "Subject-line text to match. Use this when the user explicitly asks to match the email subject. If the user describes email content, topic, meaning, or general keyword matching without naming the subject line, use aiInstructions instead.",
);

const requiredStaticSubjectSchema = z
  .string()
  .trim()
  .min(1)
  .describe(
    "Subject-line text to match. Use this when the user explicitly asks to match the email subject. If the user describes email content, topic, meaning, or general keyword matching without naming the subject line, use aiInstructions instead.",
  );

const optionalStaticConditionSchema = optionalFromNullable(
  z.object({
    from: optionalStaticFromSchema,
    to: optionalStaticToSchema,
    subject: optionalStaticSubjectSchema,
  }),
).describe(
  "The static conditions to match. If multiple static conditions are specified, the rule will match if ALL of the conditions match (AND operation)",
);

const semanticConditionSchema = z.object({
  conditionalOperator: conditionalOperatorSchema,
  aiInstructions: requiredAiInstructionsSchema,
  static: optionalStaticConditionSchema,
});

const staticFromConditionSchema = z.object({
  conditionalOperator: conditionalOperatorSchema,
  aiInstructions: optionalAiInstructionsSchema,
  static: z.object({
    from: requiredStaticFromSchema,
    to: optionalStaticToSchema,
    subject: optionalStaticSubjectSchema,
  }),
});

const staticToConditionSchema = z.object({
  conditionalOperator: conditionalOperatorSchema,
  aiInstructions: optionalAiInstructionsSchema,
  static: z.object({
    from: optionalStaticFromSchema,
    to: requiredStaticToSchema,
    subject: optionalStaticSubjectSchema,
  }),
});

const staticSubjectConditionSchema = z.object({
  conditionalOperator: conditionalOperatorSchema,
  aiInstructions: optionalAiInstructionsSchema,
  static: z.object({
    from: optionalStaticFromSchema,
    to: optionalStaticToSchema,
    subject: requiredStaticSubjectSchema,
  }),
});

const conditionSchema = z
  .union([
    semanticConditionSchema,
    staticFromConditionSchema,
    staticToConditionSchema,
    staticSubjectConditionSchema,
  ])
  .describe(
    "The conditions to match. Include at least one semantic condition in aiInstructions or one static condition in from, to, or subject.",
  );

export function getAvailableActions(provider: string) {
  const availableActions = getAvailableActionsForRuleEditor({
    provider,
  }).filter(isDefined);
  return availableActions as [ActionType, ...ActionType[]];
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
  const allowedActionTypes = [
    ...new Set([
      ActionType.ARCHIVE,
      ActionType.LABEL,
      ActionType.MARK_READ,
      ActionType.STAR,
      ActionType.MARK_SPAM,
      ActionType.DIGEST,
      ...getAvailableActionsForRuleEditor({ provider }),
      ...getExtraAvailableActionsForRuleEditor(),
    ]),
  ] as [ActionType, ...ActionType[]];

  return z
    .object({
      type: z
        .enum(allowedActionTypes)
        .describe(
          allowedActionTypes
            .map((type) => `${type}: ${getActionTypeDescription(type)}`)
            .join("\n"),
        ),
      fields: optionalFromNullable(
        z
          .object(createActionFieldShape(provider))
          .describe("Populate only fields relevant to the selected action."),
      ),
      delayInMinutes: delayInMinutesLlmSchema,
    })
    .superRefine((action, ctx) => {
      if (action.type === ActionType.LABEL && !action.fields?.label?.trim()) {
        addRequiredFieldIssue(ctx, "label", "LABEL requires fields.label.");
      }
      if (
        (action.type === ActionType.FORWARD ||
          action.type === ActionType.SEND_EMAIL) &&
        !action.fields?.to?.trim()
      ) {
        addRequiredFieldIssue(ctx, "to", "fields.to is required.");
      }
      if (
        action.type === ActionType.CALL_WEBHOOK &&
        !action.fields?.webhookUrl?.trim()
      ) {
        addRequiredFieldIssue(
          ctx,
          "webhookUrl",
          "CALL_WEBHOOK requires fields.webhookUrl.",
        );
      }
      if (
        action.type === ActionType.MOVE_FOLDER &&
        !action.fields?.folderName?.trim()
      ) {
        addRequiredFieldIssue(
          ctx,
          "folderName",
          "MOVE_FOLDER requires fields.folderName.",
        );
      }
    })
    .describe(
      "An action to apply when the rule matches. Select a supported type and provide its required fields.",
    );
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

function getActionTypeDescription(type: ActionType) {
  switch (type) {
    case ActionType.DRAFT_EMAIL:
      return "Draft a reply to the matching inbound email without sending it. Use this for draft reply requests.";
    case ActionType.REPLY:
      return "Send a reply to the matching inbound email. Do not use this for draft reply requests.";
    case ActionType.SEND_EMAIL:
      return "Send a new outbound email. Do not use this for draft reply requests.";
    case ActionType.FORWARD:
      return "Forward the matching email.";
    case ActionType.LABEL:
      return "Apply a label to the matching email.";
    case ActionType.ARCHIVE:
      return "Archive the matching email.";
    case ActionType.MARK_READ:
      return "Mark the matching email as read.";
    case ActionType.STAR:
      return "Star the matching email.";
    case ActionType.MARK_SPAM:
      return "Mark the matching email as spam.";
    case ActionType.DIGEST:
      return "Include the matching email in a digest.";
    case ActionType.CALL_WEBHOOK:
      return "Call a webhook for the matching email. Only use this when the user explicitly asks for a webhook, external HTTP callback, or integration URL and provides the webhook URL. Do not use this for ordinary labeling, archiving, categorization, notifications, folders, or other email automation.";
    case ActionType.MOVE_FOLDER:
      return "Move the matching email to a folder.";
    default:
      return "Action type to apply to the matching email.";
  }
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
    webhookUrl: optionalStringField(
      "The webhook URL to call. Only relevant for explicit webhook or external HTTP callback requests.",
    ),
    ...(isMicrosoftProvider(provider) && {
      folderName: optionalStringField("The folder to move the email to"),
    }),
  };
}

function optionalStringField(description: string) {
  return optionalFromNullable(z.string()).describe(description);
}

function optionalFromNullable<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => value ?? undefined, schema.optional());
}

function addRequiredFieldIssue(
  ctx: z.RefinementCtx,
  field: keyof RuleActionFields,
  message: string,
) {
  ctx.addIssue({
    code: "custom",
    message,
    path: ["fields", field],
  });
}
