import { after } from "next/server";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { getStripe } from "@/ee/billing/stripe";
import { getStripeSubscriptionTier } from "@/app/(app)/premium/config";
import { handleLoopsEvents } from "@/ee/billing/stripe/loops-events";
import { syncPremiumSeats } from "@/utils/premium/server";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";

export async function syncStripeDataToDb({
  customerId,
  logger,
}: {
  customerId: string;
  logger: Logger;
}) {
  try {
    const stripe = getStripe();

    // Get current state before updating
    const currentPremium = await prisma.premium.findUnique({
      where: { stripeCustomerId: customerId },
      select: {
        stripeSubscriptionStatus: true,
        stripeTrialEnd: true,
        tier: true,
        users: { select: { email: true, name: true } },
        admins: { select: { email: true, name: true } },
      },
    });

    if (!currentPremium) {
      // This should theoretically never happen as we always create customer IDs for users before Stripe.
      // We log an error and upsert to catch and self-heal from any such issues.
      logger.error("No Premium record found for Stripe customer during sync", {
        customerId,
      });
    }

    // Fetch latest subscription data from Stripe, expanding necessary fields
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: "all",
      expand: [
        "data.default_payment_method",
        "data.items.data.price", // Expand to get product ID
      ],
    });

    // Case: No active or past subscription found for the customer
    if (subscriptions.data.length === 0) {
      logger.info("No Stripe subscription found for customer", { customerId });

      const subscriptionData = {
        stripeSubscriptionId: null,
        stripeSubscriptionItemId: null,
        stripePriceId: null,
        stripeProductId: null,
        stripeSubscriptionStatus: null,
        stripeCancelAtPeriodEnd: null,
        stripeRenewsAt: null,
        stripeTrialEnd: null,
      };

      await prisma.premium.upsert({
        where: { stripeCustomerId: customerId },
        update: subscriptionData,
        create: {
          ...subscriptionData,
          stripeCustomerId: customerId,
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

    const tier = getStripeSubscriptionTier({ priceId: price.id });

    const newTrialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    const subscriptionData = {
      tier,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: price.id,
      stripeProductId: typeof product === "string" ? product : product.id,
      stripeSubscriptionStatus: subscription.status,
      stripeRenewsAt: subscriptionItem.current_period_end
        ? new Date(subscriptionItem.current_period_end * 1000)
        : null,
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeTrialEnd: newTrialEnd,
      stripeCanceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      stripeEndedAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : null,
    };

    const updatedPremium = await prisma.premium.upsert({
      where: { stripeCustomerId: customerId },
      update: subscriptionData,
      create: {
        ...subscriptionData,
        stripeCustomerId: customerId,
      },
      select: {
        id: true,
        users: { select: { id: true } },
      },
    });

    // Handle Loops events based on state changes
    await handleLoopsEvents({
      currentPremium,
      newSubscription: subscription,
      newTier: tier,
      logger,
    });

    logger.info("Successfully updated Premium record from Stripe data", {
      customerId,
    });

    await syncPremiumSeats(updatedPremium.id);

    after(() => {
      const userIds = updatedPremium.users.map((user) => user.id);

      const statusChanged =
        currentPremium?.stripeSubscriptionStatus !== subscription.status;
      const tierChanged = currentPremium?.tier !== tier;

      if (userIds.length && (!currentPremium || statusChanged || tierChanged)) {
        ensureEmailAccountsWatched({ userIds, logger }).catch((error) => {
          logger.error("Failed to ensure email watches after Stripe sync", {
            customerId,
            userIds,
            error,
          });
        });
      }
    });
  } catch (error) {
    logger.error("Error syncing Stripe data to DB", { customerId, error });
    throw error;
  }
}
