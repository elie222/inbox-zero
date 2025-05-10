import { z } from "zod";
import { PremiumTier } from "@prisma/client";

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  lemonSqueezyCustomerId: z.coerce.number().optional(),
  emailAccountsAccess: z.coerce.number().optional(),
  period: z.enum([
    PremiumTier.BASIC_MONTHLY,
    PremiumTier.BASIC_ANNUALLY,
    PremiumTier.PRO_MONTHLY,
    PremiumTier.PRO_ANNUALLY,
    PremiumTier.BUSINESS_MONTHLY,
    PremiumTier.BUSINESS_ANNUALLY,
    PremiumTier.BUSINESS_PLUS_MONTHLY,
    PremiumTier.BUSINESS_PLUS_ANNUALLY,
    PremiumTier.COPILOT_MONTHLY,
  ]),
  count: z.coerce.number().optional(),
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
