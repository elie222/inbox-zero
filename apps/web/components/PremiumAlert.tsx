"use client";

import Link from "next/link";
import useSWR from "swr";
import { CrownIcon } from "lucide-react";
import { AlertWithButton } from "@/components/Alert";
import { Button } from "@/components/Button";
import type { UserResponse } from "@/app/api/user/me/route";
import {
  hasAiAccess,
  hasColdEmailAccess,
  hasUnsubscribeAccess,
  isPremium,
} from "@/utils/premium";
import { Tooltip } from "@/components/Tooltip";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { PremiumTier } from "@prisma/client";

export function usePremium() {
  const swrResponse = useSWR<UserResponse>("/api/user/me");
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
  };
}

function PremiumAlert({
  plan = "Inbox Zero Business",
  showSetApiKey,
}: {
  plan?: "Inbox Zero Business" | "Inbox Zero Pro";
  showSetApiKey: boolean;
}) {
  const { PremiumModal, openModal } = usePremiumModal();

  return (
    <>
      <AlertWithButton
        title="Premium"
        description={
          <>
            This is a premium feature. Upgrade to {plan}
            {showSetApiKey ? (
              <>
                {" "}
                or set an AI API key on the{" "}
                <Link
                  href="/settings"
                  className="font-semibold hover:text-gray-700"
                >
                  settings
                </Link>{" "}
                page.
              </>
            ) : (
              <>.</>
            )}
          </>
        }
        icon={<CrownIcon className="h-4 w-4" />}
        button={<Button onClick={openModal}>Upgrade</Button>}
        variant="blue"
      />
      <PremiumModal />
    </>
  );
}

export function PremiumAlertWithData() {
  const {
    hasAiAccess,
    isLoading: isLoadingPremium,
    isProPlanWithoutApiKey,
  } = usePremium();

  if (!isLoadingPremium && !hasAiAccess)
    return <PremiumAlert showSetApiKey={isProPlanWithoutApiKey} />;

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
      <div>{props.children}</div>
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
