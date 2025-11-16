import { after } from "next/server";
import sumBy from "lodash/sumBy";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getStripe } from "@/ee/billing/stripe";
import { getStripeSubscriptionTier } from "@/app/(app)/premium/config";
import { handleLoopsEvents } from "@/ee/billing/stripe/loops-events";
import { updateAccountSeatsForPremium } from "@/utils/premium/server";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import type { Prisma } from "@prisma/client";

const logger = createScopedLogger("stripe/syncStripeDataToDb");

export async function syncStripeDataToDb({
  customerId,
}: {
  customerId: string;
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
      // Update the corresponding Premium record to reflect no active subscription
      await prisma.premium.update({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: null,
          stripeSubscriptionItemId: null,
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

    const tier = getStripeSubscriptionTier({ priceId: price.id });

    const newTrialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    const updatedPremium = await prisma.premium.update({
      where: { stripeCustomerId: customerId },
      data: {
        tier,
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionItemId: subscriptionItem.id,
        stripePriceId: price.id,
        stripeProductId: typeof product === "string" ? product : product.id, // Handle expanded product object
        stripeSubscriptionStatus: subscription.status,
        stripeRenewsAt: subscriptionItem.current_period_end // RenewsAt uses the item's period end
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
      },
      select: {
        stripeSubscriptionItemId: true,
        pendingInvites: true,
        users: {
          select: {
            id: true,
            email: true,
            _count: { select: { emailAccounts: true } },
          },
        },
      },
    });

    // Handle Loops events based on state changes
    await handleLoopsEvents({
      currentPremium,
      newSubscription: subscription,
      newTier: tier,
    });

    logger.info("Successfully updated Premium record from Stripe data", {
      customerId,
    });

    await syncSeats(updatedPremium);

    after(() => {
      const userIds = updatedPremium.users.map((user) => user.id);

      const statusChanged =
        currentPremium?.stripeSubscriptionStatus !== subscription.status;
      const tierChanged = currentPremium?.tier !== tier;

      if (userIds.length && (!currentPremium || statusChanged || tierChanged)) {
        ensureEmailAccountsWatched({ userIds }).catch((error) => {
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

async function syncSeats(
  premium: Prisma.PremiumGetPayload<{
    select: {
      users: {
        select: { email: true; _count: { select: { emailAccounts: true } } };
      };
      pendingInvites: true;
      stripeSubscriptionItemId: true;
    };
  }>,
) {
  try {
    // Get all connected user emails
    const connectedUserEmails = new Set(premium.users.map((u) => u.email));

    // Filter out pending invites that are already connected users to avoid double counting
    const uniquePendingInvites = (premium.pendingInvites || []).filter(
      (email) => !connectedUserEmails.has(email),
    );

    // total seats = premium users + unique pending invites (excluding duplicates)
    const totalSeats =
      sumBy(premium.users, (u) => u._count.emailAccounts) +
      uniquePendingInvites.length;

    await updateAccountSeatsForPremium(premium, totalSeats);
  } catch (error) {
    logger.error("Error updating account seats for premium", {
      stripeSubscriptionItemId: premium.stripeSubscriptionItemId,
      error,
    });
  }
}
