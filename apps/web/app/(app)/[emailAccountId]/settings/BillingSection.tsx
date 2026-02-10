"use client";

import { usePremium } from "@/components/PremiumAlert";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { MessageText } from "@/components/Typography";
import { SettingsSection } from "@/components/SettingsSection";

export function BillingSection() {
  const { premium, isLoading } = usePremium();

  return (
    <SettingsSection
      title="Billing"
      description="Manage your billing information and subscription."
    >
      <LoadingContent loading={isLoading}>
        {premium?.lemonSqueezyCustomerId || premium?.stripeSubscriptionId ? (
          <ManageSubscription premium={premium} />
        ) : (
          <MessageText>No billing information.</MessageText>
        )}
      </LoadingContent>
    </SettingsSection>
  );
}
