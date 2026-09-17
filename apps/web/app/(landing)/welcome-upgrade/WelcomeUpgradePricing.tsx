"use client";

import { AppPricingLazy } from "@/app/(app)/premium/AppPricingLazy";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";
import type { CheckoutReturnTo } from "@/utils/actions/premium.validation";

export function WelcomeUpgradePricing({
  checkoutReturnTo,
}: {
  checkoutReturnTo?: CheckoutReturnTo;
}) {
  return (
    <AppPricingLazy
      showSkipUpgrade
      header={<WelcomeUpgradeHeader />}
      checkoutReturnTo={checkoutReturnTo}
    />
  );
}
