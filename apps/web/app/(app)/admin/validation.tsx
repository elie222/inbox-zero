import { z } from "zod";

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  lemonSqueezyCustomerId: z
    .number()
    .optional()
    .transform((v) => v || undefined),
  period: z.enum(["monthly", "annually", "lifetime"]).optional(),
  upgrade: z.boolean(),
});
export type ChangePremiumStatusOptions = z.infer<
  typeof changePremiumStatusSchema
>;
