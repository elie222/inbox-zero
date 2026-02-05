import { z } from "zod";

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("requiresFirstContact") }),
  z.object({ type: z.literal("requiresThreadExists") }),
  z.object({
    type: z.literal("requiresMinMessages"),
    minCount: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("requiresOptIn"),
    feature: z.string().min(1),
  }),
]);

export const conditionsArraySchema = z.array(conditionSchema);

export type Condition = z.infer<typeof conditionSchema>;

export function validateConditions(conditions: unknown): Condition[] {
  return conditionsArraySchema.parse(conditions);
}
