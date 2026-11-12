"use client";

import Link from "next/link";
import { CrownIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { usePremium } from "@/hooks/usePremium";
import { Tooltip } from "@/components/Tooltip";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { PremiumTier } from "@/generated/prisma/enums";
import { starterTierName } from "@/app/(app)/premium/config";
import { ActionCard } from "@/components/ui/card";
import { EndTrialButton } from "@/components/EndTrialButton";
import { isActivePremium } from "@/utils/premium";

export function PremiumAiAssistantAlert({
  showSetApiKey,
  className,
  tier,
  stripeSubscriptionStatus,
  activeOnly,
}: {
  showSetApiKey: boolean;
  className?: string;
  tier?: PremiumTier | null;
  stripeSubscriptionStatus?: string | null;
  activeOnly?: boolean;
}) {
  const { t } = useLingui();
  const { PremiumModal, openModal } = usePremiumModal();

  const isBasicPlan = tier === "BASIC_MONTHLY" || tier === "BASIC_ANNUALLY";

  if (activeOnly && stripeSubscriptionStatus === "trialing") {
    return (
      <div className={className}>
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title={t`Active Subscription Required`}
          description={t`This feature is not available during the free trial. Start your paid plan to use it.`}
          action={<EndTrialButton variant="primaryBlack" />}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {isBasicPlan ? (
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title={t`${starterTierName} Plan Required`}
          description={t`Switch to the ${starterTierName} plan to use this feature.`}
          action={
            <Button variant="primaryBlack" onClick={openModal}>
              <Trans>Switch Plan</Trans>
            </Button>
          }
        />
      ) : showSetApiKey ? (
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title={t`API Key Required`}
          description={t`You need to set an AI API key to use this feature.`}
          action={
            <Button variant="primaryBlack" asChild>
              <Link href="/settings">
                <Trans>Set API Key</Trans>
              </Link>
            </Button>
          }
        />
      ) : (
        <ActionCard
          icon={<CrownIcon className="h-5 w-5" />}
          title={t`Premium Feature`}
          description={t`This is a premium feature. Upgrade to the ${starterTierName} plan.`}
          action={
            <Button variant="primaryBlack" onClick={openModal}>
              <Trans>Upgrade</Trans>
            </Button>
          }
        />
      )}
      <PremiumModal />
    </div>
  );
}

export function PremiumAlertWithData({
  className,
  activeOnly,
}: {
  className?: string;
  activeOnly?: boolean;
}) {
  const {
    hasAiAccess,
    isLoading: isLoadingPremium,
    isProPlanWithoutApiKey,
    tier,
    premium,
  } = usePremium();

  const needsActiveSubscription = activeOnly && !isActivePremium(premium);

  if (!isLoadingPremium && (!hasAiAccess || needsActiveSubscription)) {
    return (
      <PremiumAiAssistantAlert
        showSetApiKey={isProPlanWithoutApiKey}
        className={className}
        tier={tier}
        stripeSubscriptionStatus={premium?.stripeSubscriptionStatus || null}
        activeOnly={activeOnly}
      />
    );
  }

  return null;
}

export function PremiumTooltip(props: {
  children: React.ReactElement;
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
      <p>
        <Trans>You've hit the free tier limit 🥺</Trans>
      </p>
      <p>
        <Trans>Upgrade to unlock full access.</Trans>
      </p>
      <Button className="mt-1" onClick={openModal} size="xs">
        <Trans>Upgrade</Trans>
      </Button>
    </div>
  );
}
