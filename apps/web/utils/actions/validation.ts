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

const zodField = z
  .object({
    value: z.string().nullish(),
    ai: z.boolean().nullish(),
  })
  .nullish();

const zodAction = z.object({
  type: zodActionType,
  label: zodField,
  subject: zodField,
  content: zodField,
  to: zodField,
  cc: zodField,
  bcc: zodField,
});

export const zodRuleType = z.enum([
  RuleType.AI,
  RuleType.STATIC,
  RuleType.GROUP,
]);

export const createRuleBody = z.object({
  id: z.string().optional(),
  name: z.string(),
  instructions: z.string().nullish(),
  automate: z.boolean().nullish(),
  runOnThreads: z.boolean().nullish(),
  actions: z.array(zodAction),
  type: zodRuleType,
  // static conditions
  from: z.string().nullish(),
  to: z.string().nullish(),
  subject: z.string().nullish(),
  // body: z.string().nullish(), // not in use atm
  // group
  groupId: z.string().nullish(),
});
export type CreateRuleBody = z.infer<typeof createRuleBody>;

export const updateRuleBody = createRuleBody.extend({
  id: z.string(),
  actions: z.array(zodAction.extend({ id: z.string().optional() })),
});
export type UpdateRuleBody = z.infer<typeof updateRuleBody>;

// api key
export const createApiKeyBody = z.object({ name: z.string().nullish() });
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const deactivateApiKeyBody = z.object({ id: z.string() });
export type DeactivateApiKeyBody = z.infer<typeof deactivateApiKeyBody>;
