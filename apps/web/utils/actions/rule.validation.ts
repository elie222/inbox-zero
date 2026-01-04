import { z } from "zod";
import {
  ActionType,
  LogicalOperator,
  SystemType,
} from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import { NINETY_DAYS_MINUTES } from "@/utils/date";
import { validateLabelNameBasic } from "@/utils/gmail/label-validation";

export const delayInMinutesSchema = z
  .number()
  .min(1, "Minimum supported delay is 1 minute")
  .max(NINETY_DAYS_MINUTES, "Maximum supported delay is 90 days")
  .nullish();

const zodActionType = z.enum([
  ActionType.ARCHIVE,
  ActionType.DRAFT_EMAIL,
  ActionType.FORWARD,
  ActionType.LABEL,
  ActionType.MARK_SPAM,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.CALL_WEBHOOK,
  ActionType.MARK_READ,
  ActionType.DIGEST,
  ActionType.MOVE_FOLDER,
  ActionType.NOTIFY_SENDER,
]);

const zodConditionType = z.enum([ConditionType.AI, ConditionType.STATIC]);

const zodSystemRule = z.enum([
  SystemType.TO_REPLY,
  SystemType.FYI,
  SystemType.AWAITING_REPLY,
  SystemType.ACTIONED,
  SystemType.COLD_EMAIL,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.CALENDAR,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
]);

const zodAiCondition = z.object({
  instructions: z.string().nullish(),
});

const zodStaticCondition = z.object({
  to: z.string().nullish(),
  from: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
});

const zodCondition = z.object({
  type: zodConditionType,
  ...zodAiCondition.shape,
  ...zodStaticCondition.shape,
});
export type ZodCondition = z.infer<typeof zodCondition>;

const zodField = z
  .object({
    value: z.string().nullish(),
    ai: z.boolean().nullish(),
    // only needed for frontend
    setManually: z.boolean().nullish(),
    // label name for backup if no labelId exists (only for label field)
    name: z.string().nullish(),
  })
  .nullish();

const zodAction = z
  .object({
    id: z.string().optional(),
    type: zodActionType,
    labelId: zodField,
    subject: zodField,
    content: zodField,
    to: zodField,
    cc: zodField,
    bcc: zodField,
    url: zodField,
    folderName: zodField,
    folderId: zodField,
    delayInMinutes: delayInMinutesSchema,
  })
  .superRefine((data, ctx) => {
    if (data.type === ActionType.LABEL) {
      const labelValue =
        data.labelId?.value?.trim() || data.labelId?.name?.trim();

      if (!labelValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a label name for the Label action",
          path: ["labelId"],
        });
        return;
      }

      const validation = validateLabelNameBasic(labelValue);
      if (!validation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: validation.error!,
          path: ["labelId"],
        });
      }
    }

    if (data.type === ActionType.FORWARD && !data.to?.value?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter an email address to forward to",
        path: ["to"],
      });
    }
    if (data.type === ActionType.CALL_WEBHOOK && !data.url?.value?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a webhook URL",
        path: ["url"],
      });
    }
    if (
      data.type === ActionType.MOVE_FOLDER &&
      (!data.folderName?.value?.trim() || !data.folderId?.value?.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select a folder from the list",
        path: ["folderName"],
      });
    }
  });

export const createRuleBody = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Please enter a name"),
  instructions: z.string().nullish(),
  groupId: z.string().nullish(),
  runOnThreads: z.boolean().nullish(),
  digest: z.boolean().nullish(),
  actions: z.array(zodAction).min(1, "You must have at least one action"),
  conditions: z
    .array(zodCondition)
    .min(1, "You must have at least one condition")
    .refine(
      (conditions) => {
        // Allow multiple STATIC conditions if they have different fields populated
        // But only allow one AI condition
        const aiConditions = conditions.filter(
          (c) => c.type === ConditionType.AI,
        );
        if (aiConditions.length > 1) {
          return false;
        }

        // For STATIC conditions, check if they have different fields
        const staticConditions = conditions.filter(
          (c) => c.type === ConditionType.STATIC,
        );

        // Filter out empty static conditions (where the active field has no value)
        const nonEmptyStaticConditions = staticConditions.filter((c) => {
          return (
            c.from?.trim() ||
            c.to?.trim() ||
            c.subject?.trim() ||
            c.body?.trim()
          );
        });

        if (nonEmptyStaticConditions.length <= 1) {
          return true; // No duplicates possible
        }

        // Create a signature for each non-empty static condition based on which fields are populated
        const staticSignatures = nonEmptyStaticConditions.map((c) => {
          const fields = [];
          if (c.from) fields.push("from");
          if (c.to) fields.push("to");
          if (c.subject) fields.push("subject");
          if (c.body) fields.push("body");
          return fields.sort().join(",");
        });

        // Check for duplicates
        const uniqueSignatures = new Set(staticSignatures);
        return uniqueSignatures.size === staticSignatures.length;
      },
      {
        message: "You can't have duplicate conditions.",
      },
    ),
  conditionalOperator: z
    .enum([LogicalOperator.AND, LogicalOperator.OR])
    .default(LogicalOperator.AND)
    .optional(),
  systemType: zodSystemRule.nullish(),
});
export type CreateRuleBody = z.infer<typeof createRuleBody>;

export const updateRuleBody = createRuleBody.extend({ id: z.string() });
export type UpdateRuleBody = z.infer<typeof updateRuleBody>;

export const deleteRuleBody = z.object({ id: z.string() });

export const saveRulesPromptBody = z.object({ rulesPrompt: z.string().trim() });
export type SaveRulesPromptBody = z.infer<typeof saveRulesPromptBody>;

export const createRulesBody = z.object({ prompt: z.string().trim() });
export type CreateRulesBody = z.infer<typeof createRulesBody>;

export const updateRuleSettingsBody = z.object({
  id: z.string(),
  instructions: z.string(),
});
export type UpdateRuleSettingsBody = z.infer<typeof updateRuleSettingsBody>;

export const enableDraftRepliesBody = z.object({ enable: z.boolean() });
export type EnableDraftRepliesBody = z.infer<typeof enableDraftRepliesBody>;

export const enableMultiRuleSelectionBody = z.object({ enable: z.boolean() });
export type EnableMultiRuleSelectionBody = z.infer<
  typeof enableMultiRuleSelectionBody
>;

const categoryAction = z.enum([
  "label",
  "label_archive",
  "label_archive_delayed",
  "move_folder",
  "move_folder_delayed",
  "none",
]);
export type CategoryAction = z.infer<typeof categoryAction>;

const categoryConfig = z.object({
  action: categoryAction.nullish(),
  hasDigest: z.boolean().nullish(),
  name: z
    .string()
    .trim()
    .min(1, "Please enter a name")
    .max(40, "Please keep names under 40 characters"),
  description: z.string(),
  key: zodSystemRule.nullable(),
});
export type CategoryConfig = z.infer<typeof categoryConfig>;

export const createRulesOnboardingBody = z.array(categoryConfig);
export type CreateRulesOnboardingBody = z.infer<
  typeof createRulesOnboardingBody
>;

export const toggleRuleBody = z
  .object({
    ruleId: z.string().optional(),
    systemType: zodSystemRule.optional(),
    enabled: z.boolean(),
  })
  .refine((data) => data.ruleId || data.systemType, {
    message: "Either ruleId or systemType must be provided",
  });

export const toggleAllRulesBody = z.object({
  enabled: z.boolean(),
});
export type ToggleAllRulesBody = z.infer<typeof toggleAllRulesBody>;

export const copyRulesFromAccountBody = z.object({
  sourceEmailAccountId: z.string().min(1, "Source account is required"),
  targetEmailAccountId: z.string().min(1, "Target account is required"),
  ruleIds: z.array(z.string()).min(1, "Select at least one rule to copy"),
});
export type CopyRulesFromAccountBody = z.infer<typeof copyRulesFromAccountBody>;

// Schema for importing rules from JSON export
const importedAction = z.object({
  type: zodActionType,
  label: z.string().nullish(),
  to: z.string().nullish(),
  cc: z.string().nullish(),
  bcc: z.string().nullish(),
  subject: z.string().nullish(),
  content: z.string().nullish(),
  folderName: z.string().nullish(),
  url: z.string().nullish(),
  delayInMinutes: delayInMinutesSchema,
});

const importedRule = z
  .object({
    name: z.string().min(1),
    instructions: z.string().nullish(),
    enabled: z.boolean().optional().default(true),
    automate: z.boolean().optional().default(true),
    runOnThreads: z.boolean().optional().default(false),
    systemType: zodSystemRule.nullish(),
    conditionalOperator: z
      .enum([LogicalOperator.AND, LogicalOperator.OR])
      .optional()
      .default(LogicalOperator.AND),
    from: z.string().nullish(),
    to: z.string().nullish(),
    subject: z.string().nullish(),
    body: z.string().nullish(),
    categoryFilterType: z.string().nullish(),
    actions: z.array(importedAction).min(1),
    group: z.string().nullish(),
  })
  .refine(
    (data) =>
      data.systemType ||
      data.from ||
      data.to ||
      data.subject ||
      data.body ||
      data.instructions,
    {
      message:
        "At least one condition (from, to, subject, body, or instructions) must be provided",
    },
  );

export const importRulesBody = z.object({
  rules: z.array(importedRule).min(1, "No rules to import"),
});
export type ImportRulesBody = z.infer<typeof importRulesBody>;
export type ImportedRule = z.infer<typeof importedRule>;
