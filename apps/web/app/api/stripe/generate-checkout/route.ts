import { after, NextResponse } from "next/server";
import { getStripe } from "@/ee/billing/stripe";
import { env } from "@/env";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createPremiumForUser } from "@/utils/premium/create-premium";
import {
  trackStripeCheckoutCreated,
  trackStripeCustomerCreated,
} from "@/utils/posthog";

const logger = createScopedLogger("stripe/generate-checkout");

export const GET = withAuth(async (request) => {
  const { userId } = request.auth;
  const stripe = getStripe();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      premium: { select: { id: true, stripeCustomerId: true } },
    },
  });
  if (!user) {
    logger.error("User not found", { userId });
    throw new Error("User not found");
  }

  // Get the stripeCustomerId from your KV store
  let stripeCustomerId = user.premium?.stripeCustomerId;

  // Create a new Stripe customer if this user doesn't have one
  if (!stripeCustomerId) {
    const newCustomer = await stripe.customers.create(
      {
        email: user.email,
        metadata: { userId },
      },
      // prevent race conditions of creating 2 customers in stripe for on user
      // https://github.com/stripe/stripe-node/issues/476#issuecomment-402541143
      { idempotencyKey: userId },
    );

    after(() => trackStripeCustomerCreated(user.email, newCustomer.id));

    // Store the relation between userId and stripeCustomerId
    const premium = user.premium || (await createPremiumForUser({ userId }));

    await prisma.premium.update({
      where: { id: premium.id },
      data: { stripeCustomerId },
    });

    stripeCustomerId = newCustomer.id;
  }

  // ALWAYS create a checkout with a stripeCustomerId
  const checkout = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    success_url: `${env.NEXT_PUBLIC_BASE_URL}/api/stripe/success`,
  });

  after(() => trackStripeCheckoutCreated(user.email));

  return NextResponse.json({ checkout });
});
