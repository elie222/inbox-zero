import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { attachmentSourceInputSchema } from "@/utils/attachments/source-schema";
import { delayInMinutesSchema } from "@/utils/actions/rule.validation";
import { validateLabelNameBasic } from "@/utils/gmail/label-validation";
import {
  isWebhookActionEnabled,
  WEBHOOK_ACTION_DISABLED_MESSAGE,
} from "@/utils/webhook-action";
import { ORGANIZATION_RULE_ACTION_TYPES } from "@/utils/organizations/rule-action-types";

const organizationRuleActionType = z.enum(ORGANIZATION_RULE_ACTION_TYPES);

export const organizationRuleActionSchema = z
  .object({
    type: organizationRuleActionType,
    label: z.string().nullish(),
    subject: z.string().nullish(),
    content: z.string().nullish(),
    to: z.string().nullish(),
    cc: z.string().nullish(),
    bcc: z.string().nullish(),
    url: z.string().nullish(),
    folderName: z.string().nullish(),
    delayInMinutes: delayInMinutesSchema,
    staticAttachments: z.array(attachmentSourceInputSchema).nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.type === ActionType.LABEL) {
      const label = data.label?.trim();
      if (!label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a label name for the Label action",
          path: ["label"],
        });
      } else {
        const validation = validateLabelNameBasic(label);
        if (!validation.valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: validation.error!,
            path: ["label"],
          });
        }
      }
    }
    if (
      (data.type === ActionType.FORWARD ||
        data.type === ActionType.SEND_EMAIL) &&
      !data.to?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a recipient email address",
        path: ["to"],
      });
    }
    if (data.type === ActionType.CALL_WEBHOOK) {
      if (!isWebhookActionEnabled()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: WEBHOOK_ACTION_DISABLED_MESSAGE,
          path: ["type"],
        });
      } else if (!data.url?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please enter a webhook URL",
          path: ["url"],
        });
      }
    }
    if (data.type === ActionType.MOVE_FOLDER && !data.folderName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a folder name",
        path: ["folderName"],
      });
    }
  });

export type OrganizationRuleActionSchema = z.infer<
  typeof organizationRuleActionSchema
>;

const conditionFields = {
  instructions: z.string().trim().nullish(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  conditionalOperator: z
    .enum([LogicalOperator.AND, LogicalOperator.OR])
    .optional(),
  runOnThreads: z.boolean().optional(),
};

const actions = z
  .array(organizationRuleActionSchema)
  .min(1, "You must have at least one action");

function hasAtLeastOneCondition(data: {
  instructions?: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
}) {
  return [data.instructions, data.from, data.to, data.subject, data.body].some(
    (value) => Boolean(value?.trim()),
  );
}

const conditionRefinement = {
  message: "You must have at least one condition",
  path: ["instructions"],
};

export const createOrganizationRuleBody = z
  .object({
    organizationId: z.string(),
    name: z.string().trim().min(1, "Please enter a name"),
    enabled: z.boolean().optional(),
    actions,
    ...conditionFields,
  })
  .refine(hasAtLeastOneCondition, conditionRefinement);
export type CreateOrganizationRuleBody = z.infer<
  typeof createOrganizationRuleBody
>;

export const updateOrganizationRuleBody = z
  .object({
    organizationId: z.string(),
    organizationRuleId: z.string(),
    name: z.string().trim().min(1, "Please enter a name"),
    actions,
    ...conditionFields,
  })
  .refine(hasAtLeastOneCondition, conditionRefinement);
export type UpdateOrganizationRuleBody = z.infer<
  typeof updateOrganizationRuleBody
>;

export const deleteOrganizationRuleBody = z.object({
  organizationId: z.string(),
  organizationRuleId: z.string(),
});

export const setOrganizationRuleEnabledBody = z.object({
  organizationId: z.string(),
  organizationRuleId: z.string(),
  enabled: z.boolean(),
});

export const setMemberOrganizationRuleEnabledBody = z.object({
  ruleId: z.string(),
  enabled: z.boolean(),
});
