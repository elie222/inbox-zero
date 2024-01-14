import { z } from "zod";
import { PremiumTier } from "@prisma/client";

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  lemonSqueezyCustomerId: z
    .number()
    .optional()
    .transform((v) => v || undefined),
  period: z
    .enum([
      PremiumTier.PRO_MONTHLY,
      PremiumTier.PRO_ANNUALLY,
      PremiumTier.BUSINESS_MONTHLY,
      PremiumTier.BUSINESS_ANNUALLY,
      PremiumTier.LIFETIME,
    ])
    .optional(),
  upgrade: z.boolean(),
});
export type ChangePremiumStatusOptions = z.infer<
  typeof changePremiumStatusSchema
>;
