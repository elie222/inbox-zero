import { z } from "zod";
import { ActionType } from "@prisma/client";
import { getRule, updateRule } from "@/app/api/user/rules/[id]/controller";

export type GetRuleResponse = Awaited<ReturnType<typeof getRule>>;

export const zodActionType = z.enum([
  ActionType.ARCHIVE,
  ActionType.DRAFT_EMAIL,
  ActionType.FORWARD,
  ActionType.LABEL,
  ActionType.MARK_SPAM,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.SUMMARIZE,
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

export const updateRuleBody = z.object({
  name: z.string(),
  instructions: z.string().nullish(),
  automate: z.boolean().nullish(),
  actions: z.array(zodAction).nullish(),
});

export type UpdateRuleBody = z.infer<typeof updateRuleBody>;
export type UpdateRuleResponse = Awaited<ReturnType<typeof updateRule>>;
