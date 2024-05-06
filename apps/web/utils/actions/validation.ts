import { z } from "zod";
import { GroupItemType } from "@prisma/client";
import { ActionType, RuleType } from "@prisma/client";

// groups
export const createGroupBody = z.object({
  name: z.string(),
  prompt: z.string().optional(),
});
export type CreateGroupBody = z.infer<typeof createGroupBody>;

export const addGroupItemBody = z.object({
  groupId: z.string(),
  type: z.enum([GroupItemType.FROM, GroupItemType.SUBJECT]),
  value: z.string(),
});
export type AddGroupItemBody = z.infer<typeof addGroupItemBody>;

// rules
export const zodActionType = z.enum([
  ActionType.ARCHIVE,
  ActionType.DRAFT_EMAIL,
  ActionType.FORWARD,
  ActionType.LABEL,
  ActionType.MARK_SPAM,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
]);

export const zodAction = z.object({
  type: zodActionType,
  label: z.string().nullish(),
  subject: z.string().nullish(),
  content: z.string().nullish(),
  to: z.string().nullish(),
  cc: z.string().nullish(),
  bcc: z.string().nullish(),
});

export const zodRuleType = z.enum([
  RuleType.AI,
  RuleType.STATIC,
  RuleType.GROUP,
]);

export const createRuleBody = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string().nullish(),
  automate: z.boolean().nullish(),
  runOnThreads: z.boolean().nullish(),
  actions: z.array(zodAction).nullish(),
  groupId: z.string().nullish(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  type: zodRuleType,
});
export type CreateRuleBody = z.infer<typeof createRuleBody>;

export const updateRuleBody = createRuleBody.extend({
  id: z.string(),
});
export type UpdateRuleBody = z.infer<typeof updateRuleBody>;
