import type Stripe from "stripe";
import { getStripeSubscriptionTier } from "@/app/(app)/premium/config";
import type { PremiumTier } from "@/generated/prisma/enums";

export function getStripeTrialStartedProperties(
  event: Stripe.Event,
): Record<string, unknown> | null {
  const subscription = getTrialStartingSubscription(event);

  if (!subscription) return null;

  const subscriptionItem = subscription.items?.data[0];
  const price = subscriptionItem?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  const tier = priceId ? getStripeSubscriptionTier({ priceId }) : null;

  return {
    billingProvider: "stripe",
    billingEventId: event.id,
    billingEventType: event.type,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    trialEnd:
      typeof subscription.trial_end === "number"
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    tier,
    frequency: getBillingFrequency(tier),
    quantity: subscriptionItem?.quantity ?? null,
  };
}

function getTrialStartingSubscription(
  event: Stripe.Event,
): Stripe.Subscription | null {
  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object as Stripe.Subscription;

    if (subscription.status === "trialing" && subscription.trial_end) {
      return subscription;
    }

    return null;
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const previousAttributes = event.data.previous_attributes as
      | Partial<Stripe.Subscription>
      | undefined;

    // Only fire when the status field was explicitly part of this update,
    // and transitioned from a non-trialing state into trialing.
    if (
      subscription.status === "trialing" &&
      previousAttributes?.status !== undefined &&
      previousAttributes.status !== "trialing"
    ) {
      return subscription;
    }
  }

  return null;
}

function getBillingFrequency(tier: PremiumTier | null) {
  if (tier?.endsWith("_ANNUALLY")) return "annually";
  if (tier?.endsWith("_MONTHLY")) return "monthly";
  return null;
}
