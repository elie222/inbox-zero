import useSWR from "swr";
import type { GetAiAutomationStatusResponse } from "@/app/api/user/ai-automation-status/route";
import { usePremium } from "@/hooks/usePremium";

export function useAiAutomationStatus() {
  const { premium } = usePremium();
  const isTrial = premium?.stripeSubscriptionStatus === "trialing";

  return useSWR<GetAiAutomationStatusResponse>(
    isTrial ? "/api/user/ai-automation-status" : null,
    {
      revalidateOnFocus: false,
    },
  );
}
