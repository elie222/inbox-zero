"use client";

import { env } from "@/env";
import { useUser } from "@/hooks/useUser";
import {
  hasAiAccess,
  hasUnsubscribeAccess,
  isPremiumRecord,
} from "@/utils/premium";

export function usePremium() {
  const swrResponse = useUser();
  const { data } = swrResponse;

  const premium = data?.premium;
  const hasAiApiKey = data?.hasAiApiKey;

  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return {
      ...swrResponse,
      premium,
      isPremium: true,
      hasUnsubscribeAccess: true,
      hasAiAccess: true,
      isProPlanWithoutApiKey: false,
      tier: "PROFESSIONAL_ANNUALLY" as const,
    };
  }

  const isUserPremium = isPremiumRecord(premium);

  const isProPlanWithoutApiKey =
    (premium?.tier === "PRO_MONTHLY" || premium?.tier === "PRO_ANNUALLY") &&
    !hasAiApiKey;

  return {
    ...swrResponse,
    premium,
    isPremium: isUserPremium,
    hasUnsubscribeAccess:
      isUserPremium ||
      hasUnsubscribeAccess(premium?.tier || null, premium?.unsubscribeCredits),
    hasAiAccess:
      isUserPremium && hasAiAccess(premium?.tier || null, hasAiApiKey),
    isProPlanWithoutApiKey,
    tier: premium?.tier,
  };
}
