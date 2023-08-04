import { zodAction } from "@/app/api/user/rules/[id]/validation";
import { z } from "zod";

export const updateRulesBody = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        instructions: z.string().optional(),
        automate: z.boolean().optional(),
        actions: z.array(zodAction).optional(),
      })
    )
    .transform((rules) => rules.filter((rule) => rule.instructions?.trim())),
});
export type UpdateRulesBody = z.infer<typeof updateRulesBody>;

export const deleteRulesBody = z.object({ ruleId: z.string() });
export type DeleteRulesBody = z.infer<typeof deleteRulesBody>;
