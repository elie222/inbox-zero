import Stripe from "stripe";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

let stripe: Stripe | null = null;

export const getStripe = () => {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripe) {
    const apiBaseUrl = getEmulatorApiBaseUrl();

    stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      appInfo: {
        name: "Inbox Zero",
        version: "1.0.0",
        url: "https://www.getinboxzero.com",
      },
      typescript: true,
      ...(apiBaseUrl && {
        host: apiBaseUrl.hostname,
        port: apiBaseUrl.port,
        protocol: apiBaseUrl.protocol === "https:" ? "https" : "http",
      }),
    });
  }
  return stripe;
};

/**
 * Resolves the local Stripe emulator override. This client carries
 * STRIPE_SECRET_KEY on every request, so the override is restricted to a
 * loopback address: a misconfigured or injected value must not be able to send
 * a live key to another host. Production runs of the browser suite also set
 * NODE_ENV=production, so the environment cannot be the discriminator here.
 */
function getEmulatorApiBaseUrl() {
  if (!env.STRIPE_API_BASE_URL) return null;

  const url = new URL(env.STRIPE_API_BASE_URL);
  const isLoopbackHost =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]";
  const isHttpProtocol = url.protocol === "http:" || url.protocol === "https:";

  if (!isLoopbackHost || !isHttpProtocol) {
    throw new Error(
      "STRIPE_API_BASE_URL must be an http or https loopback address",
    );
  }

  return url;
}

export const updateStripeSubscriptionItemQuantity = async ({
  subscriptionItemId,
  quantity,
  logger,
}: {
  subscriptionItemId: string;
  quantity: number;
  logger: Logger;
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
