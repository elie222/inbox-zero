import { type Premium, PremiumTier } from "@prisma/client";

export const isPremium = (
  lemonSqueezyRenewsAt: Date | null,
  stripeSubscriptionStatus: string | null,
): boolean => {
  if (lemonSqueezyRenewsAt) return new Date(lemonSqueezyRenewsAt) > new Date();
  if (stripeSubscriptionStatus) return stripeSubscriptionStatus === "active";

  return false;
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

const tierRanking = {
  [PremiumTier.BASIC_MONTHLY]: 1,
  [PremiumTier.BASIC_ANNUALLY]: 2,
  [PremiumTier.PRO_MONTHLY]: 3,
  [PremiumTier.PRO_ANNUALLY]: 4,
  [PremiumTier.BUSINESS_MONTHLY]: 5,
  [PremiumTier.BUSINESS_ANNUALLY]: 6,
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: 7,
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: 8,
  [PremiumTier.COPILOT_MONTHLY]: 9,
  [PremiumTier.LIFETIME]: 10,
};

export const hasUnsubscribeAccess = (
  tier: PremiumTier | null,
  unsubscribeCredits?: number | null,
): boolean => {
  return !!tier || unsubscribeCredits !== 0;
};

export const hasAiAccess = (
  tier: PremiumTier | null,
  aiApiKey?: string | null,
) => {
  if (!tier) return false;

  const ranking = tierRanking[tier];

  const hasAiAccess = !!(
    ranking >= tierRanking[PremiumTier.BUSINESS_MONTHLY] ||
    (ranking >= tierRanking[PremiumTier.PRO_MONTHLY] && aiApiKey)
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
