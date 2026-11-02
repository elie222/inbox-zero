import type Stripe from "stripe";
import prisma from "@/utils/prisma";

// The customer portal asks for the reason after the cancel is confirmed, so the
// answer usually arrives on a later subscription event than the cancellation itself.
export async function saveStripeCancellationFeedback(
  subscription: Stripe.Subscription,
) {
  const feedback = subscription.cancellation_details?.feedback ?? null;
  const comment = subscription.cancellation_details?.comment || null;
  if (!subscription.canceled_at || (!feedback && !comment)) return null;

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const canceledAt = new Date(subscription.canceled_at * 1000);

  await prisma.cancellationFeedback.upsert({
    where: {
      stripeSubscriptionId_canceledAt: {
        stripeSubscriptionId: subscription.id,
        canceledAt,
      },
    },
    create: {
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      canceledAt,
      feedback,
      comment,
    },
    update: { feedback, comment },
  });

  return { feedback, comment, canceledAt };
}
