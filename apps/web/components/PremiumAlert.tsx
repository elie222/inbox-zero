"use client";

import Link from "next/link";
import { CrownIcon } from "lucide-react";
import { AlertWithButton } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import {
  hasAiAccess,
  hasColdEmailAccess,
  hasUnsubscribeAccess,
  isPremium,
} from "@/utils/premium";
import { Tooltip } from "@/components/Tooltip";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { PremiumTier } from "@prisma/client";
import { businessTierName } from "@/app/(app)/premium/config";
import { useUser } from "@/hooks/useUser";

export function usePremium() {
  const swrResponse = useUser();
  const { data } = swrResponse;

  const premium = data?.premium;
  const aiApiKey = data?.aiApiKey;

  const isUserPremium = !!(premium && isPremium(premium.lemonSqueezyRenewsAt));

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
      hasUnsubscribeAccess(
        premium?.bulkUnsubscribeAccess,
        premium?.unsubscribeCredits,
      ),
    hasAiAccess: hasAiAccess(premium?.aiAutomationAccess, aiApiKey),
    hasColdEmailAccess: hasColdEmailAccess(
      premium?.coldEmailBlockerAccess,
      aiApiKey,
    ),
    isProPlanWithoutApiKey,
    tier: premium?.tier,
  };
}

function PremiumAiAssistantAlert({
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
        <AlertWithButton
          title={`${businessTierName} Plan Required`}
          description={
            <>Switch to the {businessTierName} plan to use this feature.</>
          }
          icon={<CrownIcon className="h-4 w-4" />}
          button={<Button onClick={openModal}>Switch Plan</Button>}
          variant="blue"
        />
      ) : showSetApiKey ? (
        <AlertWithButton
          title="API Key Required"
          description="You need to set an AI API key to use this feature."
          button={
            <Button asChild variant="blue">
              <Link href="/settings">Set API Key</Link>
            </Button>
          }
          icon={<CrownIcon className="size-4" />}
          variant="blue"
        />
      ) : (
        <AlertWithButton
          title="Premium"
          description={`This is a premium feature. Upgrade to the ${businessTierName} plan.`}
          button={
            <Button onClick={openModal} variant="blue">
              Upgrade
            </Button>
          }
          icon={<CrownIcon className="size-4" />}
          variant="blue"
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
