import { z } from "zod";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { portableActionSchema } from "@/utils/actions/rule.validation";

// Messaging channels are connected per email account, so they can't be part of
// an organization-wide rule definition.
const organizationRuleAction = portableActionSchema.superRefine((data, ctx) => {
  if (
    data.type === ActionType.DRAFT_MESSAGING_CHANNEL ||
    data.type === ActionType.NOTIFY_MESSAGING_CHANNEL
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Messaging channel actions are not supported for organization rules",
      path: ["type"],
    });
  }
});

const organizationRuleFields = z.object({
  name: z.string().trim().min(1, "Please enter a name"),
  instructions: z.string().nullish(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  conditionalOperator: z
    .enum([LogicalOperator.AND, LogicalOperator.OR])
    .optional(),
  runOnThreads: z.boolean().optional(),
  actions: z
    .array(organizationRuleAction)
    .min(1, "You must have at least one action"),
  // empty/undefined means the rule applies to every member
  teamIds: z.array(z.string()).optional(),
});

function hasCondition(data: {
  instructions?: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
}) {
  return !!(
    data.instructions?.trim() ||
    data.from?.trim() ||
    data.to?.trim() ||
    data.subject?.trim() ||
    data.body?.trim()
  );
}

const conditionRequiredMessage =
  "Please add at least one condition (AI instructions, from, to, subject, or body)";

export const createOrganizationRuleBody = organizationRuleFields
  .extend({
    organizationId: z.string().min(1, "Organization ID is required"),
  })
  .refine(hasCondition, {
    message: conditionRequiredMessage,
    path: ["instructions"],
  });
export type CreateOrganizationRuleBody = z.infer<
  typeof createOrganizationRuleBody
>;

export const updateOrganizationRuleBody = organizationRuleFields
  .extend({
    id: z.string().min(1, "Rule ID is required"),
  })
  .refine(hasCondition, {
    message: conditionRequiredMessage,
    path: ["instructions"],
  });
export type UpdateOrganizationRuleBody = z.infer<
  typeof updateOrganizationRuleBody
>;

export const deleteOrganizationRuleBody = z.object({
  id: z.string().min(1, "Rule ID is required"),
});
export type DeleteOrganizationRuleBody = z.infer<
  typeof deleteOrganizationRuleBody
>;

export const toggleOrganizationRuleBody = z.object({
  id: z.string().min(1, "Rule ID is required"),
  enabled: z.boolean(),
});
export type ToggleOrganizationRuleBody = z.infer<
  typeof toggleOrganizationRuleBody
>;

export const createOrganizationTeamBody = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z
    .string()
    .trim()
    .min(1, "Please enter a team name")
    .max(40, "Please keep team names under 40 characters"),
});
export type CreateOrganizationTeamBody = z.infer<
  typeof createOrganizationTeamBody
>;

export const deleteOrganizationTeamBody = z.object({
  id: z.string().min(1, "Team ID is required"),
});
export type DeleteOrganizationTeamBody = z.infer<
  typeof deleteOrganizationTeamBody
>;

export const updateMemberTeamBody = z.object({
  memberId: z.string().min(1, "Member ID is required"),
  teamId: z.string().nullable(),
});
export type UpdateMemberTeamBody = z.infer<typeof updateMemberTeamBody>;
