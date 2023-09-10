import { gmail_v1 } from "googleapis";
import { z } from "zod";
import { executeAct } from "@/app/api/ai/act/controller";
import { actEmailWithHtml } from "@/app/api/ai/act/validation";
import { zodAction } from "@/app/api/user/rules/[id]/validation";

export const executePlanBody = z.object({
  email: actEmailWithHtml,
  actions: z.array(zodAction),
  args: z.object({
    label: z.string().optional(),
    to: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().optional(),
    content: z.string().optional(),
  }),
  ruleId: z.string(),
});
export type ExecutePlanBody = z.infer<typeof executePlanBody>;
export type ExecutePlanResponse = Awaited<ReturnType<typeof executePlan>>;

export async function executePlan(
  body: ExecutePlanBody & { planId: string; userId: string; userEmail: string },
  gmail: gmail_v1.Gmail
) {
  return executeAct({
    gmail,
    automated: false,
    email: body.email,
    act: {
      actions: body.actions,
      args: body.args,
    },
    userId: body.userId,
    userEmail: body.userEmail,
    ruleId: body.ruleId,
  });
}
