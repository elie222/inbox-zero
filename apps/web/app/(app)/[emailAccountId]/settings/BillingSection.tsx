"use client";

import Link from "next/link";
import { usePremium } from "@/components/PremiumAlert";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";

export function BillingSection() {
  const { premium, isPremium, isLoading } = usePremium();

  return (
    <LoadingContent loading={isLoading}>
      {isPremium ||
      premium?.lemonSqueezyCustomerId ||
      premium?.stripeSubscriptionId ? (
        <ManageSubscription premium={premium!} />
      ) : (
        <Button asChild variant="outline">
            <Link href="/premium">Upgrade</Link>
          </Button>
      )}
    </LoadingContent>
  );
}
