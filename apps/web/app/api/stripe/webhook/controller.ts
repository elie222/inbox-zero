import type Stripe from "stripe";
import { after } from "next/server";
import {
  getStripeCustomerIdForRefund,
  isStripeRefundEventType,
  stripeRefundEvents,
} from "@/ee/billing/stripe/refunds";
import { syncAiGenerationOverageForUpcomingInvoice } from "@/ee/billing/stripe/ai-overage";
import { syncStripeInvoicePayment } from "@/ee/billing/stripe/payments";
import { enqueueStripeInvoiceEmail } from "@/ee/billing/stripe/invoice-email";
import { getStripeTrialStartedProperties } from "@/ee/billing/stripe/posthog-events";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  getStripeSubscriptionConversionProperties,
  trackServerConversionEvent,
} from "@/utils/analytics/server-conversion-events";
import { sendFacebookConversionEvent } from "@/utils/fb";
import {
  getCheckoutSessionIdHash,
  trackBillingCancellationInitiated,
  trackBillingTrialConverted,
  trackBillingTrialStarted,
  trackStripeEvent,
  trackSubscriptionTrialStarted,
  trackTrialStarted,
} from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { completeReferralAndGrantReward } from "@/utils/referral/referral-tracking";
import { getStripeCancellationInitiatedAt } from "./cancellation-initiated";
import {
  getStripeTrialConversion,
  recordStripeTrialConversion,
} from "./trial-conversion";

const allowedEvents: Stripe.Event.Type[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "invoice.marked_uncollectible",
  "invoice.payment_succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  ...stripeRefundEvents,
];

export async function processEvent(event: Stripe.Event, logger: Logger) {
  if (!allowedEvents.includes(event.type)) return;

  const customerId = await getStripeCustomerIdForEvent(event);

  if (!customerId || typeof customerId !== "string") {
    logger.error("ID isn't string", { event });
    throw new Error(`ID isn't string.\nEvent type: ${event.type}`);
  }

  const syncResult = await Promise.allSettled([
    syncStripeDataToDb({ customerId, logger }),
  ]);

  const [stripeSync] = syncResult;

  const customer =
    event.type === "invoice.payment_succeeded"
      ? await getCustomer(customerId)
      : await getCustomerOrUndefined(customerId, event, logger);
  const email = customer?.email;

  const tasks: Promise<unknown>[] = [
    trackEvent(email, event),
    trackBillingMilestones(email, event, customerId),
    trackTrialStartedConversion(event, customer, logger),
    recordCancellationInitiated(customerId, event, customer, logger),
  ];

  let paidTrialConversion: Promise<void> | undefined;
  if (stripeSync.status === "fulfilled") {
    paidTrialConversion = handlePaidTrialConversion(
      customerId,
      event,
      customer,
      logger,
    );
    tasks.push(paidTrialConversion);
    tasks.push(
      syncStripeInvoicePayment({ event, logger }).then(() =>
        enqueueStripeInvoiceEmail({ event, logger }),
      ),
    );
    tasks.push(syncAiGenerationOverageForUpcomingInvoice({ event, logger }));
  } else {
    logger.error(
      "Skipping dependent Stripe billing syncs because customer sync failed",
      {
        customerId,
        eventType: event.type,
        error: stripeSync.reason,
      },
    );
  }

  const settledTasks = Promise.allSettled(tasks);
  if (event.type === "invoice.payment_succeeded") {
    after(() => settledTasks);
    if (stripeSync.status === "rejected") throw stripeSync.reason;
    await paidTrialConversion;
    return;
  }
  return await settledTasks;
}

async function handlePaidTrialConversion(
  customerId: string,
  event: Stripe.Event,
  customer: StripeCustomerIdentity | undefined,
  logger: Logger,
) {
  if (event.type !== "invoice.payment_succeeded") return;

  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripeTrialConvertedAt: true,
      stripeTrialConversionInvoiceId: true,
      users: { select: { id: true } },
    },
  });
  const invoiceId = (event.data.object as Stripe.Invoice).id;
  if (
    !premium ||
    (premium.stripeTrialConvertedAt &&
      premium.stripeTrialConversionInvoiceId !== invoiceId)
  )
    return;

  const trialConversion = await getStripeTrialConversion(event);
  if (
    !trialConversion ||
    premium.stripeSubscriptionId !== trialConversion.subscription.id
  )
    return;

  const { subscription, invoice, convertedAt } = trialConversion;
  const recorded = await recordStripeTrialConversion({
    premiumId: premium.id,
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
    convertedAt,
  });
  if (!recorded) return;

  const conversion = getStripeSubscriptionConversionProperties(subscription);
  conversion.properties.amount = invoice.amount_paid;
  conversion.properties.currency = invoice.currency.toUpperCase();
  const conversionId = `${invoice.id}:trial_converted`;

  await Promise.all([
    ...premium.users.map((user) =>
      completeReferralAndGrantReward(user.id, logger),
    ),
    trackServerConversionEvent({
      name: "subscription_created",
      throwOnError: true,
      id: conversionId,
      timestamp: convertedAt,
      ...conversion,
      logger,
    }),
    trackFacebookBillingConversion({
      eventName: "Subscribe",
      eventId: conversionId,
      eventTime: convertedAt,
      conversion,
      customer,
      logger,
    }),
    ...(customer
      ? [
          trackBillingTrialConverted(customer.email, {
            billingProvider: "stripe",
            billingEventId: event.id,
            billingEventType: event.type,
            invoiceId: invoice.id,
            subscriptionId: subscription.id,
            convertedAt: convertedAt.toISOString(),
            planId: conversion.properties.planId,
            amount: invoice.amount_paid,
            currency: invoice.currency.toUpperCase(),
          }),
        ]
      : []),
  ]);
}

async function recordCancellationInitiated(
  customerId: string,
  event: Stripe.Event,
  customer: StripeCustomerIdentity | undefined,
  logger: Logger,
) {
  const initiatedAt = getStripeCancellationInitiatedAt(event);
  if (!initiatedAt) return;

  const updateResult = await prisma.premium.updateMany({
    where: {
      stripeCustomerId: customerId,
      stripeCancellationInitiatedAt: null,
    },
    data: { stripeCancellationInitiatedAt: initiatedAt },
  });

  if (updateResult.count === 0) return;

  const subscription = event.data.object as Stripe.Subscription;
  if (customer) {
    await trackBillingCancellationInitiated(customer.email, {
      billingProvider: "stripe",
      billingEventId: event.id,
      billingEventType: event.type,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      cancellationInitiatedAt: initiatedAt.toISOString(),
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  logger.info("Recorded user-initiated cancellation timestamp", {
    customerId,
    initiatedAt,
  });
}

async function trackTrialStartedConversion(
  event: Stripe.Event,
  customer: StripeCustomerIdentity | undefined,
  logger: Logger,
) {
  if (event.type !== "customer.subscription.created") return;

  const subscription = event.data.object as Stripe.Subscription;
  if (subscription.status !== "trialing" || !subscription.trial_start) return;
  const eventId = `${event.id}:trial_started`;
  const eventTime = new Date(subscription.trial_start * 1000);
  const conversion = getStripeSubscriptionConversionProperties(subscription);

  await Promise.all([
    trackServerConversionEvent({
      name: "trial_started",
      id: eventId,
      timestamp: eventTime,
      ...conversion,
      logger,
    }),
    trackFacebookBillingConversion({
      eventName: "StartTrial",
      eventId,
      eventTime,
      conversion,
      customer,
      logger,
    }),
  ]);
}

type StripeCustomerIdentity = {
  userId: string;
  email: string;
};

async function trackFacebookBillingConversion({
  eventName,
  eventId,
  eventTime,
  conversion,
  customer,
  logger,
}: {
  eventName: "StartTrial" | "Subscribe";
  eventId: string;
  eventTime: Date;
  conversion: ReturnType<typeof getStripeSubscriptionConversionProperties>;
  customer: StripeCustomerIdentity | undefined;
  logger: Logger;
}) {
  if (!customer) {
    logger.warn("Skipping Facebook billing conversion without a customer", {
      eventName,
      eventId,
    });
    return;
  }

  const { clickIds, properties } = conversion;
  const customData = {
    ...(properties.currency ? { currency: properties.currency } : {}),
    ...(properties.planId ? { content_name: properties.planId } : {}),
    ...(properties.currency && typeof properties.amount === "number"
      ? { value: eventName === "StartTrial" ? 0 : properties.amount / 100 }
      : {}),
  };

  try {
    await sendFacebookConversionEvent({
      eventName,
      eventTime,
      eventId,
      eventSourceUrl: env.NEXT_PUBLIC_BASE_URL,
      userId: customer.userId,
      email: customer.email,
      fbc: clickIds?.fbc,
      fbp: clickIds?.fbp,
      customData,
    });
  } catch (error) {
    logger.error("Facebook billing conversion tracking failed", {
      error,
      eventName,
      eventId,
    });
    if (eventName === "Subscribe") throw error;
  }
}

async function trackEvent(email: string | undefined, event: Stripe.Event) {
  const checkoutSessionIdHash =
    event.type === "checkout.session.completed"
      ? getCheckoutSessionIdHash(
          (event.data.object as Stripe.Checkout.Session).id,
        )
      : undefined;

  return trackStripeEvent(email ?? "Unknown", {
    ...event.data.object,
    id: event.id,
    type: event.type,
    ...(checkoutSessionIdHash && { checkoutSessionIdHash }),
    object: event.data.object, // for legacy
  });
}

async function trackBillingMilestones(
  email: string | undefined,
  event: Stripe.Event,
  customerId: string,
) {
  const distinctId = email ?? customerId;

  const tasks: Promise<unknown>[] = [];

  const trialProperties = getStripeTrialStartedProperties(event);
  if (trialProperties) {
    tasks.push(trackBillingTrialStarted(distinctId, trialProperties));

    if (event.type === "customer.subscription.created") {
      tasks.push(trackTrialStarted(distinctId, trialProperties));
    } else {
      tasks.push(trackSubscriptionTrialStarted(distinctId, trialProperties));
    }
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

async function getCustomer(customerId: string) {
  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { users: { select: { id: true, email: true } } },
  });

  const user = premium?.users[0];
  return user ? { userId: user.id, email: user.email } : undefined;
}

async function getCustomerOrUndefined(
  customerId: string,
  event: Stripe.Event,
  logger: Logger,
) {
  try {
    return await getCustomer(customerId);
  } catch (error) {
    logger.error("Failed to resolve Stripe customer", {
      customerId,
      eventType: event.type,
      error,
    });
  }
}

async function getStripeCustomerIdForEvent(event: Stripe.Event) {
  const object = event.data.object;
  const customerId =
    "customer" in object ? normalizeStripeId(object.customer) : null;

  if (customerId) {
    return customerId;
  }

  if (!isStripeRefundEventType(event.type)) {
    return null;
  }

  return await getStripeCustomerIdForRefund(object as Stripe.Refund);
}

function normalizeStripeId(value: string | { id: string } | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}
