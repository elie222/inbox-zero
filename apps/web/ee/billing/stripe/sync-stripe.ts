import { after } from "next/server";
import type Stripe from "stripe";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { getStripe } from "@/ee/billing/stripe";
import { getStripeSubscriptionTier } from "@/app/(app)/premium/config";
import { handleLoopsEvents } from "@/ee/billing/stripe/loops-events";
import { syncPremiumSeats } from "@/utils/premium/seats";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { captureException } from "@/utils/error";

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
    const stripeSubscriptionStatus =
      getEffectiveStripeSubscriptionStatus(subscription);

    const newTrialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    const subscriptionData = {
      tier,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: price.id,
      stripeProductId: typeof product === "string" ? product : product.id,
      stripeSubscriptionStatus,
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

    if (currentPremium?.stripeSubscriptionStatus !== stripeSubscriptionStatus) {
      logger.info("Stripe subscription status changing", {
        customerId,
        previousStatus: currentPremium?.stripeSubscriptionStatus,
        newStatus: stripeSubscriptionStatus,
        subscriptionId: subscription.id,
      });
    }

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
        admins: { select: { id: true } },
      },
    });

    // If no admin is recorded, resolve the purchaser from the Stripe customer's
    // trusted metadata.userId (written on customer creation) and verify they
    // are still linked to this premium before connecting. Skips if the metadata
    // is absent or the user is no longer linked; claimPremiumAdminAction exists
    // as a manual override for those cases.
    if (updatedPremium.admins.length === 0 && updatedPremium.users.length > 0) {
      await connectPurchaserAsAdmin({
        stripe,
        customerId,
        premium: updatedPremium,
        logger,
      });
    }

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
        currentPremium?.stripeSubscriptionStatus !== stripeSubscriptionStatus;
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
    captureException(error, { extra: { customerId } });
    throw error;
  }
}

function getEffectiveStripeSubscriptionStatus(subscription: {
  status: string;
  cancel_at_period_end: boolean;
}) {
  return subscription.status === "trialing" && subscription.cancel_at_period_end
    ? "canceled"
    : subscription.status;
}

export { getEffectiveStripeSubscriptionStatus };

// Resolves the purchaser from the Stripe customer's trusted metadata.userId
// (written at customer-creation time) and connects them as premium admin only
// if they are still linked to this premium. Exported for use in the backfill
// admin action.
// Returns true if an admin was connected, false if the purchaser could not be
// established (deleted customer, missing metadata.userId, or userId not linked
// to this premium).
export async function connectPurchaserAsAdmin({
  stripe,
  customerId,
  premium,
  logger,
}: {
  stripe: Stripe;
  customerId: string;
  premium: { id: string; users: { id: string }[] };
  logger: Logger;
}): Promise<boolean> {
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    logger.warn("Stripe customer deleted; cannot establish purchaser", {
      customerId,
      premiumId: premium.id,
    });
    return false;
  }

  const purchaserUserId = customer.metadata?.userId;
  const linkedUserIds = new Set(premium.users.map((u) => u.id));

  if (!purchaserUserId || !linkedUserIds.has(purchaserUserId)) {
    logger.warn(
      "Cannot establish purchaser from Stripe metadata; skipping admin assignment",
      {
        customerId,
        premiumId: premium.id,
        hasMetadataUserId: !!purchaserUserId,
        metadataUserIsLinked: purchaserUserId
          ? linkedUserIds.has(purchaserUserId)
          : false,
      },
    );
    return false;
  }

  await prisma.premium.update({
    where: { id: premium.id },
    data: { admins: { connect: { id: purchaserUserId } } },
  });

  logger.info("Recorded Stripe purchaser as premium admin", {
    customerId,
    premiumId: premium.id,
    userId: purchaserUserId,
  });

  return true;
}
