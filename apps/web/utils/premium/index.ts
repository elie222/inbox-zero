import { type Premium, PremiumTier } from "@prisma/client";

// SELF-HOSTED: Premium checks removed - all features unlocked
function _isPremiumStripe(_stripeSubscriptionStatus: string | null): boolean {
  return true; // Always return true for self-hosted
}

function _isPremiumLemonSqueezy(_lemonSqueezyRenewsAt: Date | null): boolean {
  return true; // Always return true for self-hosted
}

export const isPremium = (
  _lemonSqueezyRenewsAt: Date | null,
  _stripeSubscriptionStatus: string | null,
): boolean => {
  return true; // Always return true for self-hosted - all features unlocked
};

export const isActivePremium = (
  _premium: Pick<
    Premium,
    "lemonSqueezyRenewsAt" | "stripeSubscriptionStatus"
  > | null,
): boolean => {
  return true; // Always return true for self-hosted - all features unlocked
};

export const getUserTier = (
  _premium?: Pick<
    Premium,
    "tier" | "lemonSqueezyRenewsAt" | "stripeSubscriptionStatus"
  > | null,
) => {
  // Always return highest tier for self-hosted - all features unlocked
  return PremiumTier.BUSINESS_PLUS_MONTHLY;
};

export const isAdminForPremium = (
  _premiumAdmins: { id: string }[],
  _userId: string,
) => {
  return true; // Always return true for self-hosted - all features unlocked
};

const _tierRanking = {
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
  _tier: PremiumTier | null,
  _unsubscribeCredits?: number | null,
): boolean => {
  return true; // Always return true for self-hosted - unlimited unsubscribes
};

export const hasAiAccess = (
  _tier: PremiumTier | null,
  _aiApiKey?: string | null,
) => {
  return true; // Always return true for self-hosted - full AI access
};

export const hasTierAccess = (_params: {
  tier: PremiumTier | null;
  minimumTier: PremiumTier;
}): boolean => {
  return true; // Always return true for self-hosted - all tier features unlocked
};

export function isOnHigherTier(
  _tier1?: PremiumTier | null,
  _tier2?: PremiumTier | null,
) {
  return true; // Always return true for self-hosted - highest tier access
}
