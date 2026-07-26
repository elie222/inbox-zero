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
  const invoice = await stripe.invoices.createPreview({
    subscription: premium.stripeSubscriptionId,
    subscription_details: { trial_end: "now" },
  });

  return {
    planName: getPremiumTierName(premium.tier),
    isAnnual: premium.tier?.endsWith("_ANNUALLY") ?? false,
    trialEnd: premium.stripeTrialEnd,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
  };
}

export const GET = withAuth("user/trial-preview", async (request) =>
  NextResponse.json(await getTrialPreview({ userId: request.auth.userId })),
);
