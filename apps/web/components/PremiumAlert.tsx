"use client";

import Link from "next/link";
import { CrownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasAiAccess, hasUnsubscribeAccess, isPremium } from "@/utils/premium";
import { Tooltip } from "@/components/Tooltip";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { PremiumTier } from "@prisma/client";
import { businessTierName } from "@/app/(app)/premium/config";
import { useUser } from "@/hooks/useUser";
import { ActionCard } from "@/components/ui/card";

export function usePremium() {
  const swrResponse = useUser();
  const { data } = swrResponse;

  const premium = data?.premium;
  const aiApiKey = data?.aiApiKey;

  const isUserPremium = !!(
    premium &&
    isPremium(premium.lemonSqueezyRenewsAt, premium.stripeSubscriptionStatus)
  );

  const isProPlanWithoutApiKey =
    (premium?.tier === PremiumTier.PRO_MONTHLY ||
      premium?.tier === PremiumTier.PRO_ANNUALLY) &&
    !aiApiKey;

  return {
    ...swrResponse,
    premium,
    isPremium: isUserPremium,
    hasUnsubscribeAccess:
      isUserPremium ||
      hasUnsubscribeAccess(premium?.tier || null, premium?.unsubscribeCredits),
    hasAiAccess: hasAiAccess(premium?.tier || null, aiApiKey),
    isProPlanWithoutApiKey,
    tier: premium?.tier,
  };
}

export function PremiumAiAssistantAlert({
  showSetApiKey,
  className,
  tier,
}: {
  showSetApiKey: boolean;
  className?: string;
  tier?: PremiumTier | null;
}) {
  const { PremiumModal, openModal } = usePremiumModal();

  const isBasicPlan =
    tier === PremiumTier.BASIC_MONTHLY || tier === PremiumTier.BASIC_ANNUALLY;

  return (
    <div className={className}>
      {isBasicPlan ? (
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title={`${businessTierName} Plan Required`}
          description={`Switch to the ${businessTierName} plan to use this feature.`}
          action={<Button onClick={openModal}>Switch Plan</Button>}
        />
      ) : showSetApiKey ? (
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title="API Key Required"
          description="You need to set an AI API key to use this feature."
          action={
            <Button asChild>
              <Link href="/settings">Set API Key</Link>
            </Button>
          }
        />
      ) : (
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title="Premium Feature"
          description={`This is a premium feature. Upgrade to the ${businessTierName} plan.`}
          action={<Button onClick={openModal}>Upgrade</Button>}
        />
      )}
      <PremiumModal />
    </div>
  );
}

export function PremiumAlertWithData({ className }: { className?: string }) {
  const {
    hasAiAccess,
    isLoading: isLoadingPremium,
    isProPlanWithoutApiKey,
    tier,
  } = usePremium();

  if (!isLoadingPremium && !hasAiAccess) {
    return (
      <PremiumAiAssistantAlert
        showSetApiKey={isProPlanWithoutApiKey}
        className={className}
        tier={tier}
      />
    );
  }

  return null;
}

export function PremiumTooltip(props: {
  children: React.ReactElement<any>;
  showTooltip: boolean;
  openModal: () => void;
}) {
  if (!props.showTooltip) return props.children;

  return (
    <Tooltip
      contentComponent={<PremiumTooltipContent openModal={props.openModal} />}
    >
      <span>{props.children}</span>
    </Tooltip>
  );
}

export function PremiumTooltipContent({
  openModal,
}: {
  openModal: () => void;
}) {
  return (
    <div className="text-center">
      <p>You{"'"}ve hit the free tier limit 🥺</p>
      <p>Upgrade to unlock full access.</p>
      <Button className="mt-1" onClick={openModal} size="xs">
        Upgrade
      </Button>
    </div>
  );
}
