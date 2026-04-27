import type Stripe from "stripe";

export function getStripeCancellationInitiatedAt(event: Stripe.Event) {
  if (event.type !== "customer.subscription.updated") return null;

  const subscription = event.data.object as Stripe.Subscription;
  const previousAttributes = event.data.previous_attributes as
    | Partial<Stripe.Subscription>
    | undefined;

  if (!previousAttributes) return null;

  const scheduledCancelAt =
    "cancel_at" in previousAttributes &&
    previousAttributes.cancel_at == null &&
    subscription.cancel_at != null;

  const flaggedForPeriodEnd =
    "cancel_at_period_end" in previousAttributes &&
    previousAttributes.cancel_at_period_end === false &&
    subscription.cancel_at_period_end === true;

  if (!scheduledCancelAt && !flaggedForPeriodEnd) return null;

  return new Date(event.created * 1000);
}
