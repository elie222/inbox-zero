"use server";

import { env } from "@/env.mjs";
import {
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
  return updateSubscriptionItem(options.id, options.quantity);
}
