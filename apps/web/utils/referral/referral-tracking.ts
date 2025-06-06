import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import addMonths from "date-fns/addMonths";

const logger = createScopedLogger("referral-tracking");

/**
 * Mark a referral as trial started when the referred user begins their trial
 */
export async function markTrialStarted(userId: string) {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredUserId: userId },
    });

    if (!referral) {
      logger.info("No referral found for user", { userId });
      return null;
    }

    if (referral.status !== "PENDING") {
      logger.info("Referral already progressed beyond PENDING", {
        userId,
        status: referral.status,
      });
      return referral;
    }

    const updatedReferral = await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "TRIAL_STARTED",
        trialStartedAt: new Date(),
      },
    });

    logger.info("Marked referral trial as started", {
      referralId: referral.id,
      userId,
    });

    return updatedReferral;
  } catch (error) {
    logger.error("Error marking trial as started", { error, userId });
    throw error;
  }
}

/**
 * Mark a referral as completed and grant the reward
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
            premiumId: true,
          },
        },
      },
    });

    if (!referral) {
      logger.info("No referral found for user", { userId });
      return null;
    }

    if (referral.status === "REWARDED") {
      logger.info("Referral already rewarded", {
        userId,
        referralId: referral.id,
      });
      return referral;
    }

    if (referral.status !== "TRIAL_STARTED") {
      logger.warn("Attempting to complete referral not in TRIAL_STARTED status", {
        userId,
        referralId: referral.id,
        status: referral.status,
      });
    }

    // Start a transaction to update referral and create reward
    const result = await prisma.$transaction(async (tx) => {
      // Update referral status
      const updatedReferral = await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: "REWARDED",
          trialCompletedAt: new Date(),
          rewardGranted: true,
        },
      });

      // Calculate reward expiration (1 month from now)
      const expiresAt = addMonths(new Date(), 1);

      // Create the reward
      const reward = await tx.referralReward.create({
        data: {
          referralId: referral.id,
          userId: referral.referrerUserId,
          rewardType: "FREE_MONTH",
          rewardValue: 1,
          expiresAt,
        },
      });

      // If the referrer has a premium account, extend it
      if (referral.referrerUser.premiumId) {
        await extendPremiumSubscription(
          referral.referrerUser.premiumId,
          1,
          tx
        );
      }

      return { referral: updatedReferral, reward };
    });

    logger.info("Completed referral and granted reward", {
      referralId: referral.id,
      rewardId: result.reward.id,
      referrerUserId: referral.referrerUserId,
    });

    return result;
  } catch (error) {
    logger.error("Error completing referral", { error, userId });
    throw error;
  }
}

/**
 * Extend a premium subscription by the specified number of months
 */
async function extendPremiumSubscription(
  premiumId: string,
  months: number,
  tx: any
) {
  const premium = await tx.premium.findUnique({
    where: { id: premiumId },
    select: {
      stripeRenewsAt: true,
      lemonSqueezyRenewsAt: true,
    },
  });

  if (!premium) {
    logger.error("Premium not found", { premiumId });
    return;
  }

  // Determine which payment provider is being used
  const currentRenewDate = premium.stripeRenewsAt || premium.lemonSqueezyRenewsAt;
  
  if (!currentRenewDate) {
    logger.warn("No renewal date found for premium", { premiumId });
    return;
  }

  const newRenewDate = addMonths(currentRenewDate, months);

  // Update the appropriate renewal date based on provider
  const updateData = premium.stripeRenewsAt
    ? { stripeRenewsAt: newRenewDate }
    : { lemonSqueezyRenewsAt: newRenewDate };

  await tx.premium.update({
    where: { id: premiumId },
    data: updateData,
  });

  logger.info("Extended premium subscription", {
    premiumId,
    months,
    newRenewDate,
  });
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string) {
  const [referralCode, referrals, rewards] = await Promise.all([
    prisma.referralCode.findUnique({
      where: { userId },
    }),
    prisma.referral.findMany({
      where: { referrerUserId: userId },
      include: {
        referredUser: {
          select: {
            email: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referralReward.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const stats = {
    totalReferrals: referrals.length,
    pendingReferrals: referrals.filter((r) => r.status === "PENDING").length,
    activeTrials: referrals.filter((r) => r.status === "TRIAL_STARTED").length,
    completedReferrals: referrals.filter((r) => r.status === "REWARDED").length,
    totalRewards: rewards.length,
    activeRewards: rewards.filter((r) => !r.expiresAt || r.expiresAt > new Date()).length,
  };

  return {
    referralCode,
    referrals,
    rewards,
    stats,
  };
}

/**
 * Check if a referral trial has expired (more than 7 days without completion)
 */
export async function checkAndExpireStaleTrials() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const expiredTrials = await prisma.referral.updateMany({
    where: {
      status: "TRIAL_STARTED",
      trialStartedAt: {
        lt: sevenDaysAgo,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });

  if (expiredTrials.count > 0) {
    logger.info("Expired stale referral trials", {
      count: expiredTrials.count,
    });
  }

  return expiredTrials.count;
}