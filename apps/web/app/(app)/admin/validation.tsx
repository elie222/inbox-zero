import { z } from "zod";
import { PremiumTier } from "@prisma/client";

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  lemonSqueezyCustomerId: z.coerce.number().optional(),
  emailAccountsAccess: z.coerce.number().optional(),
  period: z.nativeEnum(PremiumTier),
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
