import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getStripe } from "@/ee/billing/stripe";

const logger = createScopedLogger("stripe/syncStripeDataToDb");

export async function syncStripeDataToDb({
  customerId,
}: {
  customerId: string;
}) {
  try {
    const stripe = getStripe();

    // Fetch latest subscription data from Stripe, expanding necessary fields
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: "all",
      expand: [
        "data.default_payment_method",
        "data.items.data.price.product", // Expand to get product ID
      ],
    });

    // Case: No active or past subscription found for the customer
    if (subscriptions.data.length === 0) {
      logger.info("No Stripe subscription found for customer", { customerId });
      // Update the corresponding Premium record to reflect no active subscription
      await prisma.premium.update({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: null,
          stripePriceId: null,
          stripeProductId: null,
          stripeSubscriptionStatus: null, // Or 'none', 'canceled' depending on desired state
          stripeCancelAtPeriodEnd: null,
          stripeRenewsAt: null,
          stripeTrialEnd: null,
          // Keep stripeCanceledAt and stripeEndedAt as they might be relevant if it *was* canceled/ended previously
        },
      });
      logger.info("Updated Premium record for customer with no subscription", {
        customerId,
      });
      return;
    }

    // One subscription per customer
    const subscription = subscriptions.data[0];
    const subscriptionItem = subscription.items.data[0];

    if (!subscriptionItem.price || typeof subscriptionItem.price !== "object") {
      logger.error("Subscription item price data is missing or not an object", {
        customerId,
        subscriptionId: subscription.id,
        itemId: subscriptionItem.id,
      });
      throw new Error(
        "Invalid subscription item price data received from Stripe.",
      );
    }
    const price = subscriptionItem.price;

    if (!price.product) {
      logger.error("Price product data is missing", {
        customerId,
        subscriptionId: subscription.id,
        priceId: price.id,
      });
      throw new Error("Missing product data in price received from Stripe.");
    }
    const product = price.product;

    // Prepare data for Prisma update, mapping Stripe fields to Prisma schema
    const premiumUpdateData = {
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripePriceId: price.id,
      stripeProductId: typeof product === "string" ? product : product.id, // Handle expanded product object
      stripeRenewsAt: subscriptionItem.current_period_end // RenewsAt uses the item's period end
        ? new Date(subscriptionItem.current_period_end * 1000)
        : null,
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeTrialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      stripeCanceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      stripeEndedAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : null,
    };

    await prisma.premium.update({
      where: { stripeCustomerId: customerId },
      data: premiumUpdateData,
    });

    logger.info("Successfully updated Premium record from Stripe data", {
      customerId,
    });
  } catch (error) {
    logger.error("Error syncing Stripe data to DB", { customerId, error });
    throw error;
  }
}
