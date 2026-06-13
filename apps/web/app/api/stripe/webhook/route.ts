import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { getStripe } from "@/ee/billing/stripe";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { captureException } from "@/utils/error";
import { processEvent } from "./controller";

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
