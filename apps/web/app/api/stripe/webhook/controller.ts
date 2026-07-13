import type Stripe from "stripe";
import {
  getStripeCustomerIdForRefund,
  isStripeRefundEventType,
  stripeRefundEvents,
} from "@/ee/billing/stripe/refunds";
import { syncAiGenerationOverageForUpcomingInvoice } from "@/ee/billing/stripe/ai-overage";
import { syncStripeInvoicePayment } from "@/ee/billing/stripe/payments";
import { sendStripeInvoiceEmail } from "@/ee/billing/stripe/invoice-email";
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

  const customer = await getCustomerOrUndefined(customerId, event, logger);
  const email = customer?.email;

  const tasks: Promise<unknown>[] = [
    trackEvent(email, event),
    trackBillingMilestones(email, event, customerId),
    handleReferralCompletion(customerId, event, logger),
    trackTrialStartedConversion(event, customer, logger),
    trackPaidSubscriptionConversion(event, customer, logger),
    recordCancellationInitiated(customerId, event, logger),
  ];

  if (stripeSync.status === "fulfilled") {
    tasks.push(
      syncStripeInvoicePayment({ event, logger }).then(() =>
        sendStripeInvoiceEmail({ event, logger }),
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
  customer: StripeCustomerIdentity | undefined,
  logger: Logger,
) {
  const trialConvertedAt = getStripeTrialConvertedAt(event);
  if (!trialConvertedAt) return;

  const subscription = event.data.object as Stripe.Subscription;
  const conversion = getStripeSubscriptionConversionProperties(subscription);

  await Promise.all([
    trackServerConversionEvent({
      name: "subscription_created",
      id: event.id,
      timestamp: trialConvertedAt,
      ...conversion,
      logger,
    }),
    trackFacebookBillingConversion({
      eventName: "Subscribe",
      eventId: event.id,
      eventTime: trialConvertedAt,
      conversion,
      customer,
      logger,
    }),
  ]);
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
  }
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
