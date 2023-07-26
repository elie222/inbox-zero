import { Action } from "@prisma/client";
import { z } from "zod";

export const updateRulesBody = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().optional(),
        value: z.string(),
        automate: z.boolean().optional(),
        actions: z.array(z.nativeEnum(Action)).optional(),
      })
    )
    .transform((rules) => rules.filter((rule) => rule.value.trim())),
});

export type UpdateRulesBody = z.infer<typeof updateRulesBody>;

export const deleteRulesBody = z.object({ ruleId: z.string() });
export type DeleteRulesBody = z.infer<typeof deleteRulesBody>;
