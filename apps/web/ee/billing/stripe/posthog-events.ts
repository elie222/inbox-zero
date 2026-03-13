import type Stripe from "stripe";

export function getStripeTrialStartedProperties(
  event: Stripe.Event,
): Record<string, unknown> | null {
  const subscription = getTrialStartingSubscription(event);

  if (!subscription) return null;

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
