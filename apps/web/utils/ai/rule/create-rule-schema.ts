import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { isDefined } from "@/utils/types";
import {
  getOnlyIntegrationToolSpec,
  type IntegrationToolSpec,
} from "@/utils/mcp/tool-specs";
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
import { isIntegrationActionGloballyEnabled } from "@/utils/integration-action";

const conditionalOperatorSchema = z
  .enum([LogicalOperator.AND, LogicalOperator.OR])
  .nullable()
  .describe(
    "The conditional operator to use. AND means all conditions must be true for the rule to match. OR means any condition can be true for the rule to match. This does not impact sub-conditions.",
  );

const optionalAiInstructionsSchema = z
  .string()
  .nullish()
  .transform((v) => (v?.trim() ? v : null))
  .describe(AI_INSTRUCTIONS_PROMPT_DESCRIPTION);

const optionalStaticFromSchema = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null)
  .refine((value) => !isInvalidStaticFromValue(value), {
    message: INVALID_STATIC_FROM_MESSAGE,
  })
  .describe(STATIC_FROM_CONDITION_DESCRIPTION);

const optionalStaticToSchema = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null)
  .describe("The to email address to match");

const optionalStaticSubjectSchema = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || null)
  .describe(
    "Subject-line text to match. Use this when the user explicitly asks to match the email subject. If the user describes email content, topic, meaning, or general keyword matching without naming the subject line, use aiInstructions instead.",
  );

const conditionSchema = z
  .object({
    conditionalOperator: conditionalOperatorSchema,
    aiInstructions: optionalAiInstructionsSchema,
    static: z
      .object({
        from: optionalStaticFromSchema,
        to: optionalStaticToSchema,
        subject: optionalStaticSubjectSchema,
      })
      .nullish()
      .describe(
        "The static conditions to match. If multiple static conditions are specified, the rule will match if ALL of the conditions match (AND operation)",
      ),
  })
  .refine(
    (condition) =>
      Boolean(
        condition.aiInstructions ||
          condition.static?.from ||
          condition.static?.to ||
          condition.static?.subject,
      ),
    {
      message:
        "Include aiInstructions or at least one of static.from, static.to or static.subject.",
    },
  )
  .describe(
    "The conditions to match. Include at least one semantic condition in aiInstructions or one static condition in from, to, or subject.",
  );

export function getAvailableActions(provider: string) {
  const availableActions = getAvailableActionsForRuleEditor({
    provider,
  }).filter(isDefined);
  return availableActions as [ActionType, ...ActionType[]];
}

export const getExtraActions = ({
  existingActionTypes = [],
  integrationActionsEnabled,
}: {
  existingActionTypes?: ActionType[];
  integrationActionsEnabled: boolean;
}) =>
  getExtraAvailableActionsForRuleEditor({
    existingActionTypes,
    integrationActionsEnabled,
  });

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
  integrationActionsEnabled = isIntegrationActionGloballyEnabled(),
): z.ZodType<RuleAction> => {
  const allowedActionTypes = new Set([
    ...getAvailableActionsForRuleEditor({ provider }),
    ...getExtraAvailableActionsForRuleEditor({ integrationActionsEnabled }),
  ]);
  const integrationToolSpec = allowedActionTypes.has(ActionType.INTEGRATION)
    ? getOnlyIntegrationToolSpec()
    : undefined;
  const actionTypes = AI_RULE_ACTION_TYPES.filter(
    (type) =>
      ALWAYS_AVAILABLE_ACTION_TYPES.has(type) ||
      (allowedActionTypes.has(type) &&
        (type !== ActionType.INTEGRATION || integrationToolSpec)),
  ) as [ActionType, ...ActionType[]];

  return z
    .object({
      type: z
        .enum(actionTypes)
        .describe(describeActionTypes(actionTypes, integrationToolSpec)),
      fields: z
        .object(createActionFieldShape(provider, integrationToolSpec))
        .nullish()
        .describe("Set only the fields this action type uses."),
      delayInMinutes: delayInMinutesLlmSchema,
    })
    .superRefine((action, ctx) => {
      const requiredField = REQUIRED_ACTION_FIELD[action.type];
      if (!requiredField) return;
      const value = (
        action.fields as Record<string, string | null | undefined> | null
      )?.[requiredField];
      if (value) return;
      ctx.addIssue({
        code: "custom",
        path: ["fields", requiredField],
        message: `${action.type} requires fields.${requiredField}.`,
      });
    }) as z.ZodType<RuleAction>;
};

export const createRuleSchema = (
  provider: string,
  integrationActionsEnabled = isIntegrationActionGloballyEnabled(),
) =>
  z.object({
    name: z
      .string()
      .describe(
        "A short, concise name for the rule (preferably a single word). For example: 'Marketing', 'Newsletters', 'Urgent', 'Receipts'. Avoid verbose names like 'Archive and label marketing emails'.",
      ),
    condition: conditionSchema,
    actions: z
      .array(createRuleActionSchema(provider, integrationActionsEnabled))
      .describe("The actions to take"),
  });

export type CreateRuleSchema = z.infer<ReturnType<typeof createRuleSchema>>;
export type CreateOrUpdateRuleSchema = CreateRuleSchema & {
  ruleId?: string;
};

// The order the model sees action types in.
const AI_RULE_ACTION_TYPES = [
  ActionType.ARCHIVE,
  ActionType.LABEL,
  ActionType.MARK_READ,
  ActionType.STAR,
  ActionType.MARK_SPAM,
  ActionType.DIGEST,
  ActionType.DRAFT_EMAIL,
  ActionType.REPLY,
  ActionType.FORWARD,
  ActionType.SEND_EMAIL,
  ActionType.CALL_WEBHOOK,
  ActionType.MOVE_FOLDER,
  ActionType.INTEGRATION,
];

const ALWAYS_AVAILABLE_ACTION_TYPES = new Set<ActionType>([
  ActionType.ARCHIVE,
  ActionType.LABEL,
  ActionType.MARK_READ,
  ActionType.STAR,
  ActionType.MARK_SPAM,
  ActionType.DIGEST,
]);

const REQUIRED_ACTION_FIELD: Partial<
  Record<ActionType, keyof RuleActionFields>
> = {
  [ActionType.LABEL]: "label",
  [ActionType.FORWARD]: "to",
  [ActionType.SEND_EMAIL]: "to",
  [ActionType.CALL_WEBHOOK]: "webhookUrl",
  [ActionType.MOVE_FOLDER]: "folderName",
};

const ACTION_TYPE_DESCRIPTIONS: Partial<Record<ActionType, string>> = {
  [ActionType.ARCHIVE]: "archive the email",
  [ActionType.LABEL]: "apply fields.label",
  [ActionType.MARK_READ]: "mark it read",
  [ActionType.STAR]: "star it",
  [ActionType.MARK_SPAM]: "mark it as spam",
  [ActionType.DIGEST]: "include it in a digest",
  [ActionType.DRAFT_EMAIL]:
    "draft a reply without sending it; use this for every draft reply request",
  [ActionType.REPLY]:
    "send a reply to the matching email; never for draft requests",
  [ActionType.FORWARD]: "forward it to fields.to",
  [ActionType.SEND_EMAIL]:
    "send a new email to fields.to; never for draft requests",
  [ActionType.CALL_WEBHOOK]:
    "call fields.webhookUrl; only when the user explicitly asks for a webhook and gives its URL, never for ordinary labeling, archiving, notifications or folders",
  [ActionType.MOVE_FOLDER]: "move it to fields.folderName",
};

function describeActionTypes(
  types: readonly ActionType[],
  integrationToolSpec: IntegrationToolSpec | undefined,
) {
  const lines = types.map((type) =>
    type === ActionType.INTEGRATION
      ? `${type}: ${integrationToolSpec?.llmDescription}`
      : `${type}: ${ACTION_TYPE_DESCRIPTIONS[type]}.`,
  );
  return `What to do with the matching email. ${lines.join(" ")}`;
}

function createActionFieldShape(
  provider: string,
  integrationToolSpec: IntegrationToolSpec | undefined,
) {
  const shape: Record<string, z.ZodTypeAny> = {
    label: trimmedStringField("The label to apply. Required for LABEL."),
    to: trimmedStringField(
      "Recipient email address. Required for FORWARD and SEND_EMAIL.",
    ),
    cc: optionalStringField("Cc email address."),
    bcc: optionalStringField("Bcc email address."),
    subject: optionalStringField("Email subject."),
    content: optionalStringField("Email body."),
    webhookUrl: trimmedStringField(
      "The webhook URL. Required for CALL_WEBHOOK.",
    ),
    ...(isMicrosoftProvider(provider) && {
      folderName: trimmedStringField(
        "The folder name. Required for MOVE_FOLDER.",
      ),
    }),
  };

  for (const arg of integrationToolSpec?.args ?? []) {
    if (!arg.llmDescription) continue;
    const description = `${ActionType.INTEGRATION}: ${arg.llmDescription}`;
    const existing = shape[arg.key];
    shape[arg.key] = optionalStringField(
      existing?.description
        ? `${existing.description} ${description}`
        : description,
    );
  }

  return shape;
}

function optionalStringField(description: string) {
  return z
    .string()
    .nullish()
    .transform((value) => value ?? null)
    .describe(description);
}

function trimmedStringField(description: string) {
  return z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .describe(description);
}
