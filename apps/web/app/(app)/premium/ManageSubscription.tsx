"use client";

import { useState } from "react";
import { CreditCardIcon } from "lucide-react";
import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import { EndTrialButton } from "@/components/EndTrialButton";
import { getBillingPortalUrlAction } from "@/utils/actions/premium";
import { hasActiveAppleSubscription } from "@/utils/premium";
import { redirectToSafeUrl } from "@/utils/redirect";

const APPLE_SUBSCRIPTION_HELP_URL = "https://support.apple.com/en-us/118428";

export function ManageSubscription({
  premium,
  compact,
}: {
  compact?: boolean;
  premium:
    | {
        appleExpiresAt?: string | Date | null | undefined;
        appleRevokedAt?: string | Date | null | undefined;
        appleSubscriptionStatus?: string | null | undefined;
        stripeSubscriptionId: string | null | undefined;
        stripeSubscriptionStatus?: string | null | undefined;
        lemonSqueezyCustomerId: number | null | undefined;
      }
    | null
    | undefined;
}) {
  const size = compact ? "sm" : undefined;
  const Icon = compact ? undefined : CreditCardIcon;
  const { loading: loadingBillingPortal, openBillingPortal } =
    useOpenBillingPortal();
  const hasAppleSubscription = hasActiveAppleSubscription(
    premium?.appleExpiresAt || null,
    premium?.appleRevokedAt || null,
    premium?.appleSubscriptionStatus || null,
  );

  const hasBothStripeAndLemon = !!(
    premium?.stripeSubscriptionId && premium?.lemonSqueezyCustomerId
  );

  return (
    <>
      {premium?.stripeSubscriptionStatus === "trialing" && (
        <EndTrialButton
          variant={compact ? "outline" : undefined}
          size={size}
          showIcon={!compact}
        />
      )}

      {premium?.stripeSubscriptionId && (
        <Button
          variant={compact ? "outline" : undefined}
          size={size}
          Icon={Icon}
          loading={loadingBillingPortal}
          onClick={openBillingPortal}
        >
          {hasBothStripeAndLemon ? (
            <Trans>Manage Stripe subscription</Trans>
          ) : (
            <Trans>Manage subscription</Trans>
          )}
        </Button>
      )}

      {premium?.lemonSqueezyCustomerId && (
        <Button asChild variant={compact ? "outline" : undefined} size={size}>
          <Link
            href={`https://${env.NEXT_PUBLIC_LEMON_STORE_ID}.lemonsqueezy.com/billing`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {Icon && <Icon className="mr-2 h-4 w-4" />}
            {hasBothStripeAndLemon ? (
              <Trans>Manage Lemon subscription</Trans>
            ) : (
              <Trans>Manage subscription</Trans>
            )}
          </Link>
        </Button>
      )}

      {hasAppleSubscription && (
        <Button asChild variant="outline" size={size}>
          <Link
            href={APPLE_SUBSCRIPTION_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {Icon && <Icon className="mr-2 h-4 w-4" />}
            <Trans>Manage in App Store</Trans>
          </Link>
        </Button>
      )}
    </>
  );
}

export function ViewInvoicesButton({
  premium: { stripeCustomerId, lemonSqueezyCustomerId },
}: {
  premium: {
    stripeCustomerId: string | null | undefined;
    lemonSqueezyCustomerId: number | null | undefined;
  };
}) {
  const { loading, openBillingPortal } = useOpenBillingPortal();

  if (!stripeCustomerId && !lemonSqueezyCustomerId) return null;

  const hasBoth = !!(stripeCustomerId && lemonSqueezyCustomerId);

  return (
    <>
      {stripeCustomerId && (
        <Button
          variant="link"
          size="sm"
          loading={loading}
          onClick={openBillingPortal}
        >
          {hasBoth ? <Trans>Stripe invoices</Trans> : <Trans>Invoices</Trans>}
        </Button>
      )}

      {lemonSqueezyCustomerId && (
        <Button asChild variant="link" size="sm">
          <Link
            href={`https://${env.NEXT_PUBLIC_LEMON_STORE_ID}.lemonsqueezy.com/billing`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {hasBoth ? <Trans>Lemon invoices</Trans> : <Trans>Invoices</Trans>}
          </Link>
        </Button>
      )}
    </>
  );
}

function useOpenBillingPortal() {
  const { t } = useLingui();
  const [loading, setLoading] = useState(false);

  const openBillingPortal = async () => {
    setLoading(true);
    const result = await getBillingPortalUrlAction({});
    setLoading(false);
    const url = result?.data?.url;
    if (result?.serverError || !url) {
      toastError({
        description:
          result?.serverError ||
          t`Error loading billing portal. Please contact support.`,
      });
    } else {
      redirectToSafeUrl(url, { allowExternal: true });
    }
  };

  return { loading, openBillingPortal };
}
