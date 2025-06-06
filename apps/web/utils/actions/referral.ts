"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { applyReferralCodeBody } from "@/utils/actions/referral.validation";
import { createReferral } from "@/utils/referral/referral-code";
import { SafeError } from "@/utils/error";

export const applyReferralCodeAction = actionClientUser
  .metadata({ name: "applyReferralCode" })
  .schema(applyReferralCodeBody)
  .action(async ({ ctx: { userId }, parsedInput: { referralCode } }) => {
    try {
      const referral = await createReferral(userId, referralCode);
      
      return {
        success: true,
        referral: {
          id: referral.id,
          referrerUserId: referral.referrerUserId,
          status: referral.status,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to apply referral code";
      
      // Check for specific error messages that should be user-facing
      if (errorMessage.includes("already referred") || 
          errorMessage.includes("Invalid referral code") ||
          errorMessage.includes("cannot refer yourself")) {
        throw new SafeError(errorMessage);
      }
      
      // For other errors, throw a generic message
      throw new SafeError("Failed to apply referral code. Please try again.");
    }
  });