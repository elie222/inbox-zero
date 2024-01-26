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
