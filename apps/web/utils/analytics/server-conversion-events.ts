import type Stripe from "stripe";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

export const CONVERSION_ATTRIBUTION_COOKIE = "iz_conversion_ref";
export const CONVERSION_ATTRIBUTION_METADATA_KEY = "conversionAttributionId";

type ServerConversionEvent = {
  name: "subscription_created";
  id: string;
  timestamp: Date;
  attributionId?: string;
  properties?: {
    planId?: string;
    amount?: number;
    currency?: string;
  };
  logger: Logger;
};

export async function trackServerConversionEvent({
  name,
  id,
  timestamp,
  attributionId,
  properties,
  logger,
}: ServerConversionEvent) {
  if (!env.CONVERSION_ANALYTICS_SERVER_URL) return;

  try {
    const url = getServerConversionUrl(env.CONVERSION_ANALYTICS_SERVER_URL);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        id,
        timestamp: timestamp.toISOString(),
        attributionId,
        properties,
        sourceUrl: env.NEXT_PUBLIC_BASE_URL,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server conversion event failed: ${response.status}`);
    }
  } catch (error) {
    logger.error("Server conversion tracking failed", {
      error,
      eventName: name,
      eventId: id,
    });
  }
}

export function getStripeSubscriptionConversionProperties(
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  const price = item?.price;
  const amount =
    typeof price?.unit_amount === "number"
      ? price.unit_amount * (item.quantity || 1)
      : undefined;

  return {
    attributionId: subscription.metadata?.[CONVERSION_ATTRIBUTION_METADATA_KEY],
    properties: {
      planId: price?.id,
      amount,
      currency: price?.currency?.toUpperCase(),
    },
  };
}

function getServerConversionUrl(endpoint: string) {
  const normalizedEndpoint = endpoint.trim();

  if (
    !normalizedEndpoint.startsWith("/") ||
    normalizedEndpoint.startsWith("//")
  ) {
    throw new Error(
      "CONVERSION_ANALYTICS_SERVER_URL must be a same-origin relative path",
    );
  }

  return new URL(normalizedEndpoint, env.NEXT_PUBLIC_BASE_URL);
}
