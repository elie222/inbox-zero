import { FeatureAccess, Premium, PremiumTier } from "@prisma/client";

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
  return premium?.tier || getUserPlan(premium?.lemonSqueezyRenewsAt);
};

export const hasUnsubscribeAccess = (
  unsubscribeCredits?: number | null,
): boolean => {
  return unsubscribeCredits !== 0;
};

export const hasFeatureAccess = (
  premium: Pick<Premium, "coldEmailBlockerAccess" | "aiAutomationAccess">,
  openAIApiKey: string | null,
) => {
  const coldEmailBlockerAccess = premium.coldEmailBlockerAccess;
  const aiAutomationAccess = premium.aiAutomationAccess;

  const hasColdEmailAccess = !!(
    coldEmailBlockerAccess === FeatureAccess.UNLOCKED ||
    (coldEmailBlockerAccess === FeatureAccess.UNLOCKED_WITH_API_KEY &&
      openAIApiKey)
  );

  const hasAiAccess = !!(
    aiAutomationAccess === FeatureAccess.UNLOCKED ||
    (aiAutomationAccess === FeatureAccess.UNLOCKED_WITH_API_KEY && openAIApiKey)
  );

  const hasAiOrColdEmailAccess = hasColdEmailAccess || hasAiAccess;

  return { hasAiOrColdEmailAccess, hasColdEmailAccess, hasAiAccess };
};

export function isOnHigherTier(
  tier1?: PremiumTier | null,
  tier2?: PremiumTier | null,
) {
  const tierRanking = {
    [PremiumTier.PRO_MONTHLY]: 1,
    [PremiumTier.PRO_ANNUALLY]: 2,
    [PremiumTier.BUSINESS_MONTHLY]: 3,
    [PremiumTier.BUSINESS_ANNUALLY]: 4,
    [PremiumTier.LIFETIME]: 5,
  };

  const tier1Rank = tier1 ? tierRanking[tier1] : 0;
  const tier2Rank = tier2 ? tierRanking[tier2] : 0;

  return tier1Rank > tier2Rank;
}
