import { env } from "@/env";
import {
  lemonSqueezySetup,
  updateSubscriptionItem,
  getCustomer,
  activateLicense,
} from "@lemonsqueezy/lemonsqueezy.js";
import type { Logger } from "@/utils/logger";

let isSetUp = false;

function setUpLemon() {
  if (!env.LEMON_SQUEEZY_API_KEY) return;
  if (isSetUp) return;
  lemonSqueezySetup({ apiKey: env.LEMON_SQUEEZY_API_KEY });
  isSetUp = true;
}

export async function updateSubscriptionItemQuantity(options: {
  id: number;
  quantity: number;
  logger: Logger;
}) {
  const { logger } = options;
  setUpLemon();
  logger.info("Updating subscription item quantity", options);
  return updateSubscriptionItem(options.id, {
    quantity: options.quantity,
    invoiceImmediately: true,
  });
}

export async function getLemonCustomer(customerId: string) {
  setUpLemon();
  return getCustomer(customerId, { include: ["subscriptions", "orders"] });
}

export async function activateLemonLicenseKey(
  licenseKey: string,
  name: string,
  logger: Logger,
) {
  setUpLemon();
  logger.info("Activating license key", { licenseKey, name });
  return activateLicense(licenseKey, name);
}

// export async function switchPremiumPlan(
//   subscriptionId: number,
//   variantId: number,
// ) {
//   setUpLemon();
//   logger.info("Switching premium plan", { subscriptionId, variantId });
//   return updateSubscription(subscriptionId, { variantId });
// }
