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

export function getStripeCheckoutCompletedProperties(
  event: Stripe.Event,
): Record<string, unknown> | null {
  if (!isStripeCheckoutCompletedEvent(event)) return null;

  const session = event.data.object as Stripe.Checkout.Session;

  return {
    billingProvider: "stripe",
    billingEventId: event.id,
    billingEventType: event.type,
    checkoutSessionId: session.id,
    checkoutMode: session.mode ?? null,
    checkoutPaymentStatus: session.payment_status ?? null,
    subscriptionId:
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null,
  };
}

function isStripeCheckoutCompletedEvent(event: Stripe.Event) {
  return (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  );
}

function getTrialStartingSubscription(event: Stripe.Event): Stripe.Subscription | null {
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

    if (
      subscription.status === "trialing" &&
      previousAttributes?.status !== "trialing"
    ) {
      return subscription;
    }
  }

  return null;
}
