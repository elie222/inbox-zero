"use client";

import { usePremium } from "@/components/PremiumAlert";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { MessageText } from "@/components/Typography";

export function BillingSection() {
  const { premium, isLoading } = usePremium();

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">Billing</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your billing information and subscription.
        </p>
      </div>

      <LoadingContent loading={isLoading}>
        {premium?.lemonSqueezyCustomerId || premium?.stripeSubscriptionId ? (
          <ManageSubscription premium={premium} />
        ) : (
          <MessageText>No billing information.</MessageText>
        )}
      </LoadingContent>
    </section>
  );
}
