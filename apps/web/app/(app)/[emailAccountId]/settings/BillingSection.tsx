"use client";

import Link from "next/link";
import { usePremium } from "@/components/PremiumAlert";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingsSection } from "@/components/SettingsSection";
import { Button } from "@/components/ui/button";

export function BillingSection() {
  const { premium, isLoading } = usePremium();

  return (
    <SettingsSection>
      <LoadingContent loading={isLoading}>
        {premium?.lemonSqueezyCustomerId || premium?.stripeSubscriptionId ? (
          <ManageSubscription premium={premium} />
        ) : (
          <Button asChild variant="outline">
            <Link href="/premium">Upgrade</Link>
          </Button>
        )}
      </LoadingContent>
    </SettingsSection>
  );
}
