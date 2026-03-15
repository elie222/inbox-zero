"use client";

import Link from "next/link";
import { usePremium } from "@/components/PremiumAlert";
import {
  ManageSubscription,
  ViewInvoicesButton,
} from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import {
  getPremiumTierName,
  hasLegacyStripePriceId,
} from "@/app/(app)/premium/config";

export function BillingSection() {
  const { premium, isPremium, isLoading } = usePremium();
  const isLegacyStripePlan =
    !!premium?.stripeSubscriptionId &&
    !premium?.lemonSqueezyCustomerId &&
    hasLegacyStripePriceId({
      tier: premium?.tier,
      priceId: premium?.stripePriceId,
    });

  return (
    <LoadingContent loading={isLoading}>
      {premium &&
      (isPremium ||
        premium.lemonSqueezyCustomerId ||
        premium.stripeSubscriptionId) ? (
        <Item size="sm">
          <ItemContent>
            <ItemTitle>{getPremiumTierName(premium.tier)} plan</ItemTitle>
            {isLegacyStripePlan && (
              <ItemDescription>
                You&apos;re on grandfathered Stripe pricing. The current plan
                prices shown elsewhere in the app are for new subscriptions.
              </ItemDescription>
            )}
          </ItemContent>
          <ItemActions>
            <ManageSubscription premium={premium} />
            <ViewInvoicesButton premium={premium} />
            <Button asChild variant="outline" size="sm">
              <Link href="/premium">Change plan</Link>
            </Button>
          </ItemActions>
        </Item>
      ) : (
        <Item size="sm">
          <ItemContent>
            <ItemTitle>No active plan</ItemTitle>
          </ItemContent>
          <ItemActions>
            {premium && <ViewInvoicesButton premium={premium} />}
            <Button asChild variant="outline" size="sm">
              <Link href="/premium">Upgrade</Link>
            </Button>
          </ItemActions>
        </Item>
      )}
    </LoadingContent>
  );
}
