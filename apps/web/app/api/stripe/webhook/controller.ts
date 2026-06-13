import type Stripe from "stripe";
import {
  getStripeCustomerIdForRefund,
  isStripeRefundEventType,
  stripeRefundEvents,
} from "@/ee/billing/stripe/refunds";
import { syncAiGenerationOverageForUpcomingInvoice } from "@/ee/billing/stripe/ai-overage";
import { syncStripeInvoicePayment } from "@/ee/billing/stripe/payments";
import { getStripeTrialStartedProperties } from "@/ee/billing/stripe/posthog-events";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import type { Logger } from "@/utils/logger";
import {
  getStripeSubscriptionConversionProperties,
  trackServerConversionEvent,
} from "@/utils/analytics/server-conversion-events";
import {
  trackBillingTrialStarted,
  trackStripeEvent,
  trackSubscriptionTrialStarted,
  trackTrialStarted,
} from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { completeReferralAndGrantReward } from "@/utils/referral/referral-tracking";
import { getStripeCancellationInitiatedAt } from "./cancellation-initiated";
import { getStripeTrialConvertedAt } from "./trial-conversion";

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

  const email = await getCustomerEmailOrUndefined(customerId, event, logger);

  const tasks: Promise<unknown>[] = [
    trackEvent(email, event),
    trackBillingMilestones(email, event, customerId),
    handleReferralCompletion(customerId, event, logger),
    trackPaidSubscriptionConversion(event, logger),
    recordCancellationInitiated(customerId, event, logger),
  ];

  if (stripeSync.status === "fulfilled") {
    tasks.push(syncStripeInvoicePayment({ event, logger }));
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

  return await Promise.allSettled(tasks);
}

async function handleReferralCompletion(
  customerId: string,
  event: Stripe.Event,
  logger: Logger,
) {
  const trialConvertedAt = getStripeTrialConvertedAt(event);
  if (!trialConvertedAt) return;

  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, users: { select: { id: true } } },
  });

  if (!premium) {
    logger.warn("No user found for customer during referral completion", {
      customerId,
    });
    return;
  }

  const updateResult = await prisma.premium.updateMany({
    where: {
      id: premium.id,
      stripeTrialConvertedAt: null,
    },
    data: {
      stripeTrialConvertedAt: trialConvertedAt,
    },
  });

  if (updateResult.count === 0) return;

  const userIds = premium.users.map((user) => user.id);
  if (userIds.length === 0) {
    logger.warn("No users linked to premium during referral completion", {
      customerId,
      premiumId: premium.id,
    });
    return;
  }

  logger.info("Trial converted to paid subscription, completing referral", {
    customerId,
    trialConvertedAt,
    userIds,
  });

  for (const userId of userIds) {
    await completeReferralAndGrantReward(userId, logger);
  }
}

async function recordCancellationInitiated(
  customerId: string,
  event: Stripe.Event,
  logger: Logger,
) {
  const initiatedAt = getStripeCancellationInitiatedAt(event);
  if (!initiatedAt) return;

  const updateResult = await prisma.premium.updateMany({
    where: { stripeCustomerId: customerId },
    data: { stripeCancellationInitiatedAt: initiatedAt },
  });

  if (updateResult.count === 0) {
    logger.warn("No premium found for customer during cancellation record", {
      customerId,
    });
    return;
  }

  logger.info("Recorded user-initiated cancellation timestamp", {
    customerId,
    initiatedAt,
  });
}

async function trackPaidSubscriptionConversion(
  event: Stripe.Event,
  logger: Logger,
) {
  const trialConvertedAt = getStripeTrialConvertedAt(event);
  if (!trialConvertedAt) return;

  const subscription = event.data.object as Stripe.Subscription;

  await trackServerConversionEvent({
    name: "subscription_created",
    id: event.id,
    timestamp: trialConvertedAt,
    ...getStripeSubscriptionConversionProperties(subscription),
    logger,
  });
}

async function trackEvent(email: string | undefined, event: Stripe.Event) {
  return trackStripeEvent(email ?? "Unknown", {
    ...event.data.object,
    id: event.id,
    type: event.type,
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

async function getCustomerEmail(customerId: string) {
  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { users: { select: { email: true } } },
  });

  return premium?.users[0]?.email;
}

async function getCustomerEmailOrUndefined(
  customerId: string,
  event: Stripe.Event,
  logger: Logger,
) {
  try {
    return await getCustomerEmail(customerId);
  } catch (error) {
    logger.error("Failed to resolve Stripe customer email", {
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
