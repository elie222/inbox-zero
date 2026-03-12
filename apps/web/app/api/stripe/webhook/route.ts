import type Stripe from "stripe";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { getStripe } from "@/ee/billing/stripe";
import { withError } from "@/utils/middleware";
import type { Logger } from "@/utils/logger";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { getStripeTrialStartedProperties } from "@/ee/billing/stripe/posthog-events";
import { syncAiGenerationOverageForUpcomingInvoice } from "@/ee/billing/stripe/ai-overage";
import { env } from "@/env";
import {
  trackBillingTrialStarted,
  trackStripeEvent,
  trackSubscriptionTrialStarted,
  trackTrialStarted,
} from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { completeReferralAndGrantReward } from "@/utils/referral/referral-tracking";
import { captureException } from "@/utils/error";

export const POST = withError("stripe/webhook", async (request) => {
  const logger = request.logger;
  const body = await request.text();
  const signature = (await headers()).get("Stripe-Signature");

  if (!signature) return NextResponse.json({}, { status: 400 });

  if (typeof signature !== "string") {
    throw new Error("Header isn't a string");
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }

  const event = getStripe().webhooks.constructEvent(
    body,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );

  after(async () => {
    try {
      await processEvent(event, logger);
      logger.info("Stripe webhook processed successfully", {
        eventType: event.type,
        eventId: event.id,
      });
    } catch (error) {
      logger.error("Stripe webhook processing failed", {
        eventType: event.type,
        eventId: event.id,
        error,
      });
      captureException(error, {
        extra: { eventType: event.type, eventId: event.id },
      });
    }
  });

  return NextResponse.json({ received: true });
});

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
];

async function processEvent(event: Stripe.Event, logger: Logger) {
  if (!allowedEvents.includes(event.type)) return;

  // All the events we track have a customerId
  const customerId =
    "customer" in event.data.object ? event.data.object.customer : null;

  if (!customerId || typeof customerId !== "string") {
    logger.error("ID isn't string", { event });
    throw new Error(`ID isn't string.\nEvent type: ${event.type}`);
  }

  const syncResult = await Promise.allSettled([
    syncStripeDataToDb({ customerId, logger }),
  ]);

  const [stripeSync] = syncResult;

  const email = await getCustomerEmail(customerId);

  const tasks: Promise<unknown>[] = [
    trackEvent(email, event),
    trackBillingMilestones(email, event, customerId),
    handleReferralCompletion(customerId, event, logger),
  ];

  if (stripeSync.status === "fulfilled") {
    tasks.push(syncAiGenerationOverageForUpcomingInvoice({ event, logger }));
  } else {
    logger.error(
      "Skipping AI overage sync because Stripe customer sync failed",
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
  // Only process subscription updates
  if (event.type !== "customer.subscription.updated") return;

  const subscription = event.data.object as Stripe.Subscription;
  const previousAttributes = event.data
    .previous_attributes as Partial<Stripe.Subscription>;

  // Check if this is a trial that just converted to active
  const isTrialConversion =
    previousAttributes.status === "trialing" &&
    subscription.status === "active" &&
    subscription.trial_end &&
    subscription.trial_end < Math.floor(Date.now() / 1000);

  if (!isTrialConversion) return;

  // Find the user associated with this customer
  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { users: { select: { id: true } } },
  });

  const userIds = premium?.users.map((user) => user.id);
  if (!userIds) {
    logger.warn("No user found for customer during referral completion", {
      customerId,
    });
    return;
  }

  logger.info("Trial converted to paid subscription, completing referral", {
    customerId,
    userIds,
  });

  // Complete the referral
  for (const userId of userIds) {
    await completeReferralAndGrantReward(userId, logger);
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

async function getCustomerEmail(customerId: string) {
  const premium = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { users: { select: { email: true } } },
  });

  return premium?.users[0]?.email;
}
