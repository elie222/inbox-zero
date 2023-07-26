import { z } from "zod";

export const updateRulesBody = z.object({
  rules: z.array(
    z.object({
      id: z.string().optional(),
      value: z.string(),
      automate: z.boolean().optional(),
      actions: z.array(z.string()).optional(),
    })
  ),
});
export type UpdateRulesBody = z.infer<typeof updateRulesBody>;

export const deleteRulesBody = z.object({ ruleId: z.string() });
export type DeleteRulesBody = z.infer<typeof deleteRulesBody>;
