"use client";

import { useState } from "react";
import { CreditCardIcon } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/Toast";
import { getBillingPortalUrlAction } from "@/utils/actions/premium";

export function ManageSubscription({
  premium: { stripeSubscriptionId, lemonSqueezyCustomerId },
}: {
  premium: {
    stripeSubscriptionId: string | null | undefined;
    lemonSqueezyCustomerId: number | null | undefined;
  };
}) {
  const [loadingBillingPortal, setLoadingBillingPortal] = useState(false);

  const hasBothStripeAndLemon = !!(
    stripeSubscriptionId && lemonSqueezyCustomerId
  );

  return (
    <>
      {stripeSubscriptionId && (
        <Button
          loading={loadingBillingPortal}
          onClick={async () => {
            setLoadingBillingPortal(true);
            const result = await getBillingPortalUrlAction({});
            setLoadingBillingPortal(false);
            const url = result?.data?.url;
            if (result?.serverError || !url) {
              toastError({
                description:
                  result?.serverError ||
                  "Error loading billing portal. Please contact support.",
              });
            } else {
              window.location.href = url;
            }
          }}
        >
          <CreditCardIcon className="mr-2 h-4 w-4" />
          Manage{hasBothStripeAndLemon ? " Stripe" : ""} subscription
        </Button>
      )}

      {lemonSqueezyCustomerId && (
        <Button asChild>
          <Link
            href={`https://${env.NEXT_PUBLIC_LEMON_STORE_ID}.lemonsqueezy.com/billing`}
            target="_blank"
          >
            <CreditCardIcon className="mr-2 h-4 w-4" />
            Manage{hasBothStripeAndLemon ? " Lemon" : ""} subscription
          </Link>
        </Button>
      )}
    </>
  );
}
