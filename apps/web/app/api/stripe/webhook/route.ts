import type Stripe from "stripe";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { getStripe } from "@/ee/billing/stripe";
import { createScopedLogger } from "@/utils/logger";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { env } from "@/env";
import { trackStripeEvent } from "@/utils/posthog";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("stripe/webhook");

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature");

  if (!signature) return NextResponse.json({}, { status: 400 });

  async function doEventProcessing() {
    if (typeof signature !== "string") throw new Error("Header isn't a string");

    if (!env.STRIPE_WEBHOOK_SECRET)
      throw new Error("STRIPE_WEBHOOK_SECRET is not set");

    const event = getStripe().webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );

    after(processEvent(event));
  }

  try {
    await doEventProcessing();
  } catch (error) {
    logger.error("Error processing event", { error });
  }

  return NextResponse.json({ received: true });
}

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

async function processEvent(event: Stripe.Event) {
  if (!allowedEvents.includes(event.type)) return;

  // All the events we track have a customerId
  const { customer: customerId } = event?.data?.object as { customer: string };

  if (typeof customerId !== "string") {
    logger.error("ID isn't string", { event });
    throw new Error(`ID isn't string.\nEvent type: ${event.type}`);
  }

  return await Promise.allSettled([
    syncStripeDataToDb({ customerId }),
    trackEvent(customerId, event),
  ]);
}

async function trackEvent(customerId: string, event: Stripe.Event) {
  const user = await prisma.premium.findUnique({
    where: { stripeCustomerId: customerId },
    select: { users: { select: { email: true } } },
  });

  return trackStripeEvent(user?.users[0]?.email ?? "Unknown", event);
}
