import type { PremiumTier } from "@/generated/prisma/enums";
import type { Premium } from "@/generated/prisma/client";
import { env } from "@/env";

function isPremiumStripe(stripeSubscriptionStatus: string | null): boolean {
  if (!stripeSubscriptionStatus) return false;
  const activeStatuses = ["active", "trialing"];
  return activeStatuses.includes(stripeSubscriptionStatus);
}

function isPremiumLemonSqueezy(lemonSqueezyRenewsAt: Date | null): boolean {
  if (!lemonSqueezyRenewsAt) return false;
  return new Date(lemonSqueezyRenewsAt) > new Date();
}

export const isPremium = (
  lemonSqueezyRenewsAt: Date | null,
  stripeSubscriptionStatus: string | null,
): boolean => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  return (
    isPremiumStripe(stripeSubscriptionStatus) ||
    isPremiumLemonSqueezy(lemonSqueezyRenewsAt)
  );
};

export const isActivePremium = (
  premium: Pick<
    Premium,
    "lemonSqueezyRenewsAt" | "stripeSubscriptionStatus"
  > | null,
): boolean => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  if (!premium) return false;

  return (
    premium.stripeSubscriptionStatus === "active" ||
    isPremiumLemonSqueezy(premium.lemonSqueezyRenewsAt)
  );
};

export const getUserTier = (
  premium?: Pick<
    Premium,
    "tier" | "lemonSqueezyRenewsAt" | "stripeSubscriptionStatus"
  > | null,
) => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return "BUSINESS_PLUS_ANNUALLY" as const;
  }

  if (!premium) return null;

  const isActive = isPremium(
    premium.lemonSqueezyRenewsAt || null,
    premium.stripeSubscriptionStatus || null,
  );

  if (!isActive) return null;

  return premium.tier || null;
};

export const isAdminForPremium = (
  premiumAdmins: { id: string }[],
  userId: string,
) => {
  // if no admins are set, then we skip the check
  if (!premiumAdmins.length) return true;
  return premiumAdmins.some((admin) => admin.id === userId);
};

const tierRanking = {
  BASIC_MONTHLY: 1,
  BASIC_ANNUALLY: 2,
  PRO_MONTHLY: 3,
  PRO_ANNUALLY: 4,
  BUSINESS_MONTHLY: 5,
  BUSINESS_ANNUALLY: 6,
  BUSINESS_PLUS_MONTHLY: 7,
  BUSINESS_PLUS_ANNUALLY: 8,
  COPILOT_MONTHLY: 9,
  LIFETIME: 10,
};

export const hasUnsubscribeAccess = (
  tier: PremiumTier | null,
  unsubscribeCredits?: number | null,
): boolean => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  if (tier) return true;
  if (unsubscribeCredits && unsubscribeCredits > 0) return true;
  return false;
};

export const hasAiAccess = (
  tier: PremiumTier | null,
  aiApiKey?: string | null,
) => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  if (!tier) return false;

  const ranking = tierRanking[tier];

  const hasAiAccess = !!(
    ranking >= tierRanking.BUSINESS_MONTHLY ||
    (ranking >= tierRanking.PRO_MONTHLY && aiApiKey)
  );

  return hasAiAccess;
};

export const hasTierAccess = ({
  tier,
  minimumTier,
}: {
  tier: PremiumTier | null;
  minimumTier: PremiumTier;
}): boolean => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  if (!tier) return false;

  const ranking = tierRanking[tier];

  const hasAiAccess = ranking >= tierRanking[minimumTier];

  return hasAiAccess;
};

export function isOnHigherTier(
  tier1?: PremiumTier | null,
  tier2?: PremiumTier | null,
) {
  const tier1Rank = tier1 ? tierRanking[tier1] : 0;
  const tier2Rank = tier2 ? tierRanking[tier2] : 0;

  return tier1Rank > tier2Rank;
}

export function getPremiumUserFilter() {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return {};

  return {
    user: {
      premium: {
        OR: [
          { lemonSqueezyRenewsAt: { gt: new Date() } },
          { stripeSubscriptionStatus: { in: ["active", "trialing"] } },
        ],
      },
    },
  };
}
