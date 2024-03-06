"use server";

import { env } from "@/env.mjs";
import {
  cancelSubscription,
  lemonSqueezySetup,
  updateSubscriptionItem,
} from "@lemonsqueezy/lemonsqueezy.js";

function setUpLemon() {
  if (!env.LEMON_SQUEEZY_API_KEY) return;
  lemonSqueezySetup({ apiKey: env.LEMON_SQUEEZY_API_KEY });
}

export async function updateSubscriptionItemQuantity(options: {
  id: number;
  quantity: number;
}) {
  setUpLemon();
  return updateSubscriptionItem(options.id, {
    quantity: options.quantity,
    invoiceImmediately: true,
  });
}

export async function cancelSubScriptionForUser(
  lemonSqueezySubscriptionId: string | number,
) {
  setUpLemon();
  await cancelSubscription(lemonSqueezySubscriptionId);
}
