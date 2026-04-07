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

export function hasActiveAppleSubscription(
  appleExpiresAt: Date | string | null,
  appleRevokedAt: Date | string | null,
): boolean {
  if (!appleExpiresAt || appleRevokedAt) return false;

  return new Date(appleExpiresAt) > new Date();
}

export const isPremium = (
  lemonSqueezyRenewsAt: Date | null,
  stripeSubscriptionStatus: string | null,
  appleExpiresAt?: Date | string | null,
  appleRevokedAt?: Date | string | null,
): boolean => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  return (
    isPremiumStripe(stripeSubscriptionStatus) ||
    isPremiumLemonSqueezy(lemonSqueezyRenewsAt) ||
    hasActiveAppleSubscription(appleExpiresAt || null, appleRevokedAt || null)
  );
};

export const isActivePremium = (
  premium: Pick<
    Premium,
    | "appleExpiresAt"
    | "appleRevokedAt"
    | "lemonSqueezyRenewsAt"
    | "stripeSubscriptionStatus"
  > | null,
): boolean => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  if (!premium) return false;

  return (
    premium.stripeSubscriptionStatus === "active" ||
    isPremiumLemonSqueezy(premium.lemonSqueezyRenewsAt) ||
    hasActiveAppleSubscription(premium.appleExpiresAt, premium.appleRevokedAt)
  );
};

export const getUserTier = (
  premium?: Pick<
    Premium,
    | "appleExpiresAt"
    | "appleRevokedAt"
    | "tier"
    | "lemonSqueezyRenewsAt"
    | "stripeSubscriptionStatus"
  > | null,
) => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return "PROFESSIONAL_ANNUALLY" as const;
  }

  if (!premium) return null;

  const isActive = isPremium(
    premium.lemonSqueezyRenewsAt || null,
    premium.stripeSubscriptionStatus || null,
    premium.appleExpiresAt || null,
    premium.appleRevokedAt || null,
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
  STARTER_MONTHLY: 5,
  STARTER_ANNUALLY: 6,
  PLUS_MONTHLY: 7,
  PLUS_ANNUALLY: 8,
  PROFESSIONAL_MONTHLY: 9,
  PROFESSIONAL_ANNUALLY: 10,
  COPILOT_MONTHLY: 11,
  LIFETIME: 12,
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
  hasApiKey?: boolean | null,
) => {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  if (!tier) return false;

  const ranking = tierRanking[tier];

  const hasAiAccess = !!(
    ranking >= tierRanking.STARTER_MONTHLY ||
    (ranking >= tierRanking.PRO_MONTHLY && hasApiKey)
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
          {
            AND: [
              { appleExpiresAt: { gt: new Date() } },
              { appleRevokedAt: null },
            ],
          },
          { lemonSqueezyRenewsAt: { gt: new Date() } },
          { stripeSubscriptionStatus: { in: ["active", "trialing"] } },
        ],
      },
    },
  };
}
