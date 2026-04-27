import type Stripe from "stripe";

export function getStripeTrialConvertedAt(event: Stripe.Event) {
  if (event.type !== "customer.subscription.updated") return null;

  const subscription = event.data.object as Stripe.Subscription;
  const previousAttributes = event.data.previous_attributes as
    | Partial<Stripe.Subscription>
    | undefined;

  const isTrialConversion =
    previousAttributes?.status === "trialing" &&
    subscription.status === "active" &&
    subscription.trial_end &&
    subscription.trial_end < event.created;

  if (!isTrialConversion) return null;

  return new Date(event.created * 1000);
}
