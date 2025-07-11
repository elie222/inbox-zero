import Stripe from "stripe";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

let stripe: Stripe | null = null;

const logger = createScopedLogger("ee/billing/stripe/index");

export const getStripe = () => {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripe) {
    stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-05-28.basil",
      appInfo: {
        name: "Inbox Zero",
        version: "1.0.0",
        url: "https://www.getinboxzero.com",
      },
      typescript: true,
    });
  }
  return stripe;
};

export const updateStripeSubscriptionItemQuantity = async ({
  subscriptionItemId,
  quantity,
}: {
  subscriptionItemId: string;
  quantity: number;
}) => {
  const quantityToSet = Math.max(1, quantity);

  logger.info("Updating Stripe subscription item quantity", {
    subscriptionItemId,
    quantityAttempted: quantityToSet,
  });

  if (!subscriptionItemId) {
    logger.error("Missing subscriptionItemId for updating quantity");
    throw new Error("Subscription Item ID is required to update quantity.");
  }

  try {
    const stripe = getStripe();

    // First, get the current subscription item to check if quantity has changed
    const currentItem =
      await stripe.subscriptionItems.retrieve(subscriptionItemId);

    if (currentItem.quantity === quantityToSet) {
      logger.info("Quantity unchanged, skipping update", {
        subscriptionItemId,
        currentQuantity: currentItem.quantity,
        requestedQuantity: quantityToSet,
      });
      return currentItem;
    }

    logger.info("Quantity changed, updating Stripe", {
      subscriptionItemId,
      currentQuantity: currentItem.quantity,
      newQuantity: quantityToSet,
    });

    const updatedItem = await stripe.subscriptionItems.update(
      subscriptionItemId,
      {
        quantity: quantityToSet,
      },
    );

    return updatedItem;
  } catch (error) {
    logger.error("Failed to update Stripe subscription item quantity", {
      subscriptionItemId,
      quantityAttempted: quantityToSet,
      error,
    });
    throw error;
  }
};
