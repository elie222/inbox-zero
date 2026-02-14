"use client";

import Link from "next/link";
import { usePremium } from "@/components/PremiumAlert";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
} from "@/components/ui/item";
import type { PremiumTier } from "@/generated/prisma/enums";

export function BillingSection() {
  const { premium, isPremium, isLoading } = usePremium();

  return (
    <LoadingContent loading={isLoading}>
      {premium &&
      (isPremium ||
        premium.lemonSqueezyCustomerId ||
        premium.stripeSubscriptionId) ? (
        <Item size="sm">
          <ItemContent>
            <ItemTitle>
              {getPlanDisplayName(premium.tier)} plan
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <ManageSubscription premium={premium} />
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
            <Button asChild variant="outline" size="sm">
              <Link href="/premium">Upgrade</Link>
            </Button>
          </ItemActions>
        </Item>
      )}
    </LoadingContent>
  );
}

function getPlanDisplayName(tier: PremiumTier | null | undefined): string {
  if (!tier) return "Premium";

  const tierMap: Partial<Record<PremiumTier, string>> = {
    STARTER_MONTHLY: "Starter",
    STARTER_ANNUALLY: "Starter",
    PLUS_MONTHLY: "Plus",
    PLUS_ANNUALLY: "Plus",
    PROFESSIONAL_MONTHLY: "Professional",
    PROFESSIONAL_ANNUALLY: "Professional",
    COPILOT_MONTHLY: "Enterprise",
    BASIC_MONTHLY: "Basic",
    BASIC_ANNUALLY: "Basic",
    PRO_MONTHLY: "Pro",
    PRO_ANNUALLY: "Pro",
    LIFETIME: "Lifetime",
  };

  return tierMap[tier] ?? "Premium";
}
