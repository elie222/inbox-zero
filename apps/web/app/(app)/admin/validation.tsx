import { z } from "zod";
import { PremiumTier } from "@prisma/client";

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  lemonSqueezyCustomerId: z
    .number()
    .optional()
    .transform((v) => v || undefined),
  emailAccountsAccess: z
    .number()
    .optional()
    .transform((v) => v || undefined),
  period: z.enum([
    PremiumTier.BASIC_MONTHLY,
    PremiumTier.BASIC_ANNUALLY,
    PremiumTier.PRO_MONTHLY,
    PremiumTier.PRO_ANNUALLY,
    PremiumTier.BUSINESS_MONTHLY,
    PremiumTier.BUSINESS_ANNUALLY,
    PremiumTier.COPILOT_MONTHLY,
    PremiumTier.LIFETIME,
  ]),
  count: z.number().default(1),
  upgrade: z.boolean(),
});
export type ChangePremiumStatusOptions = z.infer<
  typeof changePremiumStatusSchema
>;

export const adminProcessHistorySchema = z.object({
  email: z.string().email(),
  historyId: z.number().optional(),
  startHistoryId: z.number().optional(),
});
export type AdminProcessHistoryOptions = z.infer<
  typeof adminProcessHistorySchema
>;
