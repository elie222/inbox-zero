import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getStripe } from "@/ee/billing/stripe";
import { ReferralStatus } from "@prisma/client";

const logger = createScopedLogger("referral-tracking");

const REWARD_AMOUNT_CENTS = 2000; // $20 credit

/**
 * Mark a referral as completed and grant the reward via Stripe balance transaction
 * Called when the referred user completes their 7-day trial
 */
export async function completeReferralAndGrantReward(userId: string) {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredUserId: userId },
      include: {
        referrerUser: {
          select: {
            id: true,
            email: true,
            premium: {
              select: {
                id: true,
                stripeCustomerId: true,
              },
            },
          },
        },
      },
    });

    if (!referral) {
      logger.info("No referral found for user", { userId });
      return;
    }

    if (referral.status === ReferralStatus.COMPLETED) {
      logger.info("Referral already rewarded", {
        userId,
        referralId: referral.id,
      });
      return;
    }

    // Check if referrer has a Stripe customer ID
    const stripeCustomerId = referral.referrerUser.premium?.stripeCustomerId;
    if (!stripeCustomerId) {
      logger.warn("Referrer has no Stripe customer ID", {
        referralId: referral.id,
        referrerUserId: referral.referrerUserId,
      });
      // Mark as completed but don't apply credit
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: ReferralStatus.COMPLETED },
      });
      return;
    }

    try {
      const stripe = getStripe();

      // Create Stripe balance transaction (credit)
      const balanceTransaction =
        await stripe.customers.createBalanceTransaction(
          stripeCustomerId,
          {
            amount: -REWARD_AMOUNT_CENTS, // Negative amount for credit
            currency: "usd",
            description: `Referral credit - ${referral.id}`,
            metadata: {
              referral_id: referral.id,
              referrer_user_id: referral.referrerUserId,
              referred_user_id: referral.referredUserId,
            },
          },
          {
            idempotencyKey: `referral_${stripeCustomerId}_${referral.id}`,
          },
        );

      // Update referral with reward information
      const updatedReferral = await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: ReferralStatus.COMPLETED,
          rewardGrantedAt: new Date(),
          stripeBalanceTransactionId: balanceTransaction.id,
          rewardAmount: REWARD_AMOUNT_CENTS,
        },
      });

      logger.info("Completed referral and granted Stripe credit", {
        referralId: referral.id,
        stripeBalanceTransactionId: balanceTransaction.id,
        referrerUserId: referral.referrerUserId,
      });

      return;
    } catch (stripeError) {
      logger.error("Failed to create Stripe balance transaction", {
        error: stripeError,
        referralId: referral.id,
        stripeCustomerId,
      });

      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: ReferralStatus.PENDING,
          rewardGrantedAt: null,
        },
      });

      throw stripeError;
    }
  } catch (error) {
    logger.error("Error completing referral", { error, userId });
    throw error;
  }
}
