import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getStripe } from "@/ee/billing/stripe";

const logger = createScopedLogger("referral-tracking");

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
      return null;
    }

    if (referral.status === "COMPLETED") {
      logger.info("Referral already rewarded", {
        userId,
        referralId: referral.id,
      });
      return referral;
    }

    // Check if referrer has a Stripe customer ID
    const stripeCustomerId = referral.referrerUser.premium?.stripeCustomerId;
    if (!stripeCustomerId) {
      logger.warn("Referrer has no Stripe customer ID", {
        referralId: referral.id,
        referrerUserId: referral.referrerUserId,
      });
      // Still mark as rewarded but don't apply credit
      const updatedReferral = await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: "COMPLETED",
          trialCompletedAt: new Date(),
          rewardGranted: true,
        },
      });
      return { referral: updatedReferral, stripeBalanceTransaction: null };
    }

    // Define reward amount (e.g., $20 = 2000 cents)
    const rewardAmountCents = 2000; // $20 credit

    try {
      const stripe = getStripe();

      // Create Stripe balance transaction (credit)
      const balanceTransaction =
        await stripe.customers.createBalanceTransaction(
          stripeCustomerId,
          {
            amount: -rewardAmountCents, // Negative amount for credit
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
          status: "COMPLETED",
          trialCompletedAt: new Date(),
          rewardGranted: true,
          stripeBalanceTransactionId: balanceTransaction.id,
          rewardAmount: rewardAmountCents,
        },
      });

      logger.info("Completed referral and granted Stripe credit", {
        referralId: referral.id,
        stripeBalanceTransactionId: balanceTransaction.id,
        rewardAmount: rewardAmountCents,
        referrerUserId: referral.referrerUserId,
      });

      return {
        referral: updatedReferral,
        stripeBalanceTransaction: balanceTransaction,
      };
    } catch (stripeError) {
      logger.error("Failed to create Stripe balance transaction", {
        error: stripeError,
        referralId: referral.id,
        stripeCustomerId,
      });

      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: "PENDING",
          trialCompletedAt: new Date(),
          rewardGranted: false,
        },
      });

      throw stripeError;
    }
  } catch (error) {
    logger.error("Error completing referral", { error, userId });
    throw error;
  }
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string) {
  const [user, referrals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    }),
    prisma.referral.findMany({
      where: { referrerUserId: userId },
      include: {
        referredUser: {
          select: {
            email: true,
            name: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const stats = {
    totalReferrals: referrals.length,
    pendingReferrals: referrals.filter((r) => r.status === "PENDING").length,
    totalRewards: referrals.filter((r) => r.rewardGranted).length,
    totalRewardAmount: referrals
      .filter((r) => r.rewardGranted && r.rewardAmount)
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0),
  };

  return {
    referralCode: user?.referralCode ? { code: user.referralCode } : null,
    referrals,
    stats,
  };
}
