import { z } from "zod";
import { ActionType, RuleType } from "@prisma/client";
import {
  createRule,
  getRule,
  updateRule,
} from "@/app/api/user/rules/[id]/controller";

export type GetRuleResponse = Awaited<ReturnType<typeof getRule>>;

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

export const updateRuleBody = z.object({
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

export type UpdateRuleBody = z.infer<typeof updateRuleBody>;
export type UpdateRuleResponse = Awaited<ReturnType<typeof updateRule>>;

export const createRuleBody = updateRuleBody;
export type CreateRuleBody = z.infer<typeof createRuleBody>;
export type CreateRuleResponse = Awaited<ReturnType<typeof createRule>>;
