"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { usePremium } from "@/hooks/usePremium";
import {
  ManageSubscription,
  ViewInvoicesButton,
} from "@/app/(app)/premium/ManageSubscription";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toastError } from "@/components/Toast";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import {
  getPremiumTierName,
  shouldShowLegacyStripePricingNotice,
} from "@/app/(app)/premium/config";
import { hasActiveAppleSubscription } from "@/utils/premium";
import { getActionErrorMessage } from "@/utils/error";
import { updateStripeInvoiceEmailsAction } from "@/utils/actions/premium";

export function BillingSection() {
  const { data, premium, isPremium, isLoading, tier, mutate } = usePremium();
  const isLegacyStripePlan = shouldShowLegacyStripePricingNotice(premium);
  const hasAppleSubscription = hasActiveAppleSubscription(
    premium?.appleExpiresAt || null,
    premium?.appleRevokedAt || null,
    premium?.appleSubscriptionStatus || null,
  );
  const { execute, isExecuting } = useAction(updateStripeInvoiceEmailsAction, {
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Failed to update invoice emails",
        }),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  const handleInvoiceEmailToggle = (enabled: boolean) => {
    if (!data?.premium) return;

    mutate(
      {
        ...data,
        premium: {
          ...data.premium,
          stripeInvoiceEmailsEnabled: enabled,
        },
      },
      false,
    );
    execute({ enabled });
  };

  return (
    <LoadingContent loading={isLoading}>
      {premium && isPremium ? (
        <Item size="sm">
          <ItemContent>
            <ItemTitle>{getPremiumTierName(tier)} plan</ItemTitle>
            {hasAppleSubscription ? (
              <ItemDescription>
                This subscription is billed through Apple. Manage or cancel it
                from your iPhone or iPad subscription settings.
              </ItemDescription>
            ) : isLegacyStripePlan ? (
              <ItemDescription>
                You&apos;re on grandfathered Stripe pricing. The current plan
                prices shown elsewhere in the app are for new subscriptions.
              </ItemDescription>
            ) : null}
          </ItemContent>
          <ItemActions>
            <ManageSubscription premium={premium} />
            <ViewInvoicesButton premium={premium} />
            {!hasAppleSubscription && (
              <Button asChild variant="outline" size="sm">
                <Link href="/premium">Change plan</Link>
              </Button>
            )}
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

      {premium?.stripeCustomerId && premium.isAdmin && (
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Email paid invoices</ItemTitle>
              <ItemDescription>
                Automatically send each Stripe invoice to the billing email.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label="Email paid Stripe invoices"
                checked={premium.stripeInvoiceEmailsEnabled}
                disabled={isExecuting}
                onCheckedChange={handleInvoiceEmailToggle}
              />
            </ItemActions>
          </Item>
        </>
      )}
    </LoadingContent>
  );
}
