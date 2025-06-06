import { z } from "zod";

export const applyReferralCodeBody = z.object({
  referralCode: z.string().min(1, "Referral code is required"),
});
export type ApplyReferralCodeBody = z.infer<typeof applyReferralCodeBody>;