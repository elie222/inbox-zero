"use client";

import { AppPricingLazy } from "@/app/(app)/premium/AppPricingLazy";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";

export function WelcomeUpgradePricing() {
  return <AppPricingLazy showSkipUpgrade header={<WelcomeUpgradeHeader />} />;
}
