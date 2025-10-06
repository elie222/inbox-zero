import { z } from "zod";
import {
  ActionType,
  CategoryFilterType,
  LogicalOperator,
  SystemType,
} from "@prisma/client";
import { ConditionType } from "@/utils/config";
import { NINETY_DAYS_MINUTES } from "@/utils/date";
import { SystemRule } from "@/utils/rule/consts";

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
  ActionType.TRACK_THREAD,
  ActionType.DIGEST,
  ActionType.MOVE_FOLDER,
]);

const zodConditionType = z.enum([
  ConditionType.AI,
  ConditionType.STATIC,
  ConditionType.CATEGORY,
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

const zodCategoryCondition = z.object({
  categoryFilterType: z
    .enum([CategoryFilterType.INCLUDE, CategoryFilterType.EXCLUDE])
    .nullish(),
  categoryFilters: z.array(z.string()).nullish(),
});

const zodCondition = z.object({
  type: zodConditionType,
  ...zodAiCondition.shape,
  ...zodStaticCondition.shape,
  ...zodCategoryCondition.shape,
});
export type ZodCondition = z.infer<typeof zodCondition>;

const zodField = z
  .object({
    value: z.string().nullish(),
    ai: z.boolean().nullish(),
    // only needed for frontend
    setManually: z.boolean().nullish(),
  })
  .nullish();

const zodAction = z
  .object({
    id: z.string().optional(),
    type: zodActionType,
    label: zodField,
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
    if (data.type === ActionType.LABEL && !data.label?.value?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a label name for the Label action",
        path: ["label"],
      });
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
        const types = conditions.map((condition) => condition.type);
        return new Set(types).size === types.length;
      },
      {
        message: "You can't have two conditions with the same type.",
      },
    ),
  conditionalOperator: z
    .enum([LogicalOperator.AND, LogicalOperator.OR])
    .default(LogicalOperator.AND)
    .optional(),
  systemType: z
    .enum([
      SystemType.TO_REPLY,
      SystemType.NEWSLETTER,
      SystemType.MARKETING,
      SystemType.CALENDAR,
      SystemType.RECEIPT,
      SystemType.NOTIFICATION,
    ])
    .nullish(),
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
  key: z.nativeEnum(SystemRule).nullable(),
});
export type CategoryConfig = z.infer<typeof categoryConfig>;

export const createRulesOnboardingBody = z.array(categoryConfig);
export type CreateRulesOnboardingBody = z.infer<
  typeof createRulesOnboardingBody
>;
