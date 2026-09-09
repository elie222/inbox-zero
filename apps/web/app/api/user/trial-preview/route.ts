import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { getStripe } from "@/ee/billing/stripe";
import { getPremiumTierName } from "@/app/(app)/premium/config";

export type GetTrialPreviewResponse = Awaited<
  ReturnType<typeof getTrialPreview>
>;

async function getTrialPreview({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          tier: true,
          stripeSubscriptionId: true,
          stripeSubscriptionStatus: true,
          stripeTrialEnd: true,
        },
      },
    },
  });

  const premium = user?.premium;
  if (!premium?.stripeSubscriptionId) {
    throw new SafeError("Stripe subscription not found");
  }
  if (premium.stripeSubscriptionStatus !== "trialing") {
    throw new SafeError("Your trial has already ended");
  }

  const stripe = getStripe();
  const [invoice, subscription] = await Promise.all([
    stripe.invoices.createPreview({
      subscription: premium.stripeSubscriptionId,
      subscription_details: { trial_end: "now" },
    }),
    stripe.subscriptions.retrieve(premium.stripeSubscriptionId),
  ]);

  return {
    planName: getPremiumTierName(premium.tier),
    // Read the cadence off the price rather than the tier name so a price we
    // haven't mapped to a tier can't be labelled with the wrong billing period.
    interval: subscription.items.data[0]?.price.recurring?.interval ?? null,
    trialEnd: premium.stripeTrialEnd,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
  };
}

export const GET = withAuth("user/trial-preview", async (request) =>
  NextResponse.json(await getTrialPreview({ userId: request.auth.userId })),
);
