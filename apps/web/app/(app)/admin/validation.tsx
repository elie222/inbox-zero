import { z } from "zod";
import { PremiumTier } from "@/generated/prisma/enums";

export const changePremiumStatusSchema = z.object({
  email: z.string().email(),
  emailAccountsAccess: z.number().int().positive().optional(),
  period: z.nativeEnum(PremiumTier),
  count: z.number().int().positive().optional(),
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
