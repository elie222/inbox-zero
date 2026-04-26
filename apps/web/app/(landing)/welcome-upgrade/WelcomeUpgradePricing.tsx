"use client";

import { AppPricingLazy } from "@/app/(app)/premium/AppPricingLazy";
import { tiers } from "@/app/(app)/premium/config";
import { useWelcomePricingVariant } from "@/hooks/useFeatureFlags";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";

const twoTiers = tiers.filter((t) => t.name !== "Professional");

export function WelcomeUpgradePricing() {
  const variant = useWelcomePricingVariant();
  const displayTiers = variant === "two-tiers" ? twoTiers : tiers;

  return (
    <AppPricingLazy
      showSkipUpgrade
      header={<WelcomeUpgradeHeader />}
      displayTiers={displayTiers}
    />
  );
}
