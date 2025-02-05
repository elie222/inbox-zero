import { FeatureAccess, type Premium, PremiumTier } from "@prisma/client";

export const isPremium = (lemonSqueezyRenewsAt: Date | null): boolean => {
  return !!lemonSqueezyRenewsAt && new Date(lemonSqueezyRenewsAt) > new Date();
};

// deprecated. we now store the plan in the database
// but this is so that things don't break for older users
const getUserPlan = (
  lemonSqueezyRenewsAt?: Date | null,
): PremiumTier | null => {
  if (!lemonSqueezyRenewsAt) return null;

  const renewsAt = new Date(lemonSqueezyRenewsAt);

  // if renewsAt is 5 years in the future then it's a lifetime plan
  if (renewsAt.getFullYear() - new Date().getFullYear() >= 5)
    return PremiumTier.LIFETIME;

  // if renewsAt is more than 6 months in the future then it's annual plan
  if (renewsAt > new Date(new Date().setMonth(new Date().getMonth() + 6)))
    return PremiumTier.BUSINESS_ANNUALLY;

  // if renewsAt is less than 6 months in the future then it's a monthly plan
  return PremiumTier.BUSINESS_MONTHLY;
};

export const getUserTier = (
  premium?: Pick<Premium, "tier" | "lemonSqueezyRenewsAt"> | null,
) => {
  if (isPremiumExpired(premium)) return null;
  return premium?.tier || getUserPlan(premium?.lemonSqueezyRenewsAt);
};

const isPremiumExpired = (
  premium?: Pick<Premium, "lemonSqueezyRenewsAt"> | null,
) => {
  return (
    !!premium?.lemonSqueezyRenewsAt &&
    new Date(premium.lemonSqueezyRenewsAt) < new Date()
  );
};

export const isAdminForPremium = (
  premiumAdmins: { id: string }[],
  userId: string,
) => {
  // if no admins are set, then we skip the check
  if (!premiumAdmins.length) return true;
  return premiumAdmins.some((admin) => admin.id === userId);
};

export const hasUnsubscribeAccess = (
  bulkUnsubscribeAccess?: FeatureAccess | null,
  unsubscribeCredits?: number | null,
): boolean => {
  if (
    bulkUnsubscribeAccess === FeatureAccess.UNLOCKED ||
    bulkUnsubscribeAccess === FeatureAccess.UNLOCKED_WITH_API_KEY
  ) {
    return true;
  }

  return unsubscribeCredits !== 0;
};

export const hasAiAccess = (
  aiAutomationAccess?: FeatureAccess | null,
  aiApiKey?: string | null,
) => {
  const hasAiAccess = !!(
    aiAutomationAccess === FeatureAccess.UNLOCKED ||
    (aiAutomationAccess === FeatureAccess.UNLOCKED_WITH_API_KEY && aiApiKey)
  );

  return hasAiAccess;
};

export const hasColdEmailAccess = (
  coldEmailBlockerAccess?: FeatureAccess | null,
  aiApiKey?: string | null,
) => {
  const hasColdEmailAccess = !!(
    coldEmailBlockerAccess === FeatureAccess.UNLOCKED ||
    (coldEmailBlockerAccess === FeatureAccess.UNLOCKED_WITH_API_KEY && aiApiKey)
  );

  return hasColdEmailAccess;
};

export function isOnHigherTier(
  tier1?: PremiumTier | null,
  tier2?: PremiumTier | null,
) {
  const tierRanking = {
    [PremiumTier.BASIC_MONTHLY]: 1,
    [PremiumTier.BASIC_ANNUALLY]: 2,
    [PremiumTier.PRO_MONTHLY]: 3,
    [PremiumTier.PRO_ANNUALLY]: 4,
    [PremiumTier.BUSINESS_MONTHLY]: 5,
    [PremiumTier.BUSINESS_ANNUALLY]: 6,
    [PremiumTier.COPILOT_MONTHLY]: 7,
    [PremiumTier.LIFETIME]: 8,
  };

  const tier1Rank = tier1 ? tierRanking[tier1] : 0;
  const tier2Rank = tier2 ? tierRanking[tier2] : 0;

  return tier1Rank > tier2Rank;
}
