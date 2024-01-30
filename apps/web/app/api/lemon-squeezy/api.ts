"use server";

import { env } from "@/env.mjs";
import { LemonSqueezy } from "@lemonsqueezy/lemonsqueezy.js";

function getLemon() {
  if (!env.LEMON_SQUEEZY_API_KEY) return;
  return new LemonSqueezy(env.LEMON_SQUEEZY_API_KEY);
}

export async function updateSubscriptionItemQuantity(options: {
  id: number;
  quantity: number;
}) {
  const ls = getLemon();
  return ls?.updateSubscriptionItem(options);
}
