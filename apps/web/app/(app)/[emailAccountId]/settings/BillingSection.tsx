"use client";

import { FormSection, FormSectionLeft } from "@/components/Form";
import { usePremium } from "@/components/PremiumAlert";
import { ManageSubscription } from "@/app/(app)/premium/Pricing";
import { LoadingContent } from "@/components/LoadingContent";
import { MessageText, TypographyP } from "@/components/Typography";

export function BillingSection() {
  const { premium, isLoading } = usePremium();
  return (
    <FormSection>
      <FormSectionLeft
        title="Billing"
        description="Manage your billing information and subscription."
      />

      <div>
        <LoadingContent loading={isLoading}>
          {premium?.lemonSqueezyCustomerId || premium?.stripeSubscriptionId ? (
            <ManageSubscription premium={premium} />
          ) : (
            <MessageText>No billing information.</MessageText>
          )}
        </LoadingContent>
      </div>
    </FormSection>
  );
}
