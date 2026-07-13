import type Stripe from "stripe";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

export const CONVERSION_ATTRIBUTION_COOKIE = "iz_conversion_ref";
export const CONVERSION_ATTRIBUTION_METADATA_KEY = "conversionAttributionId";
export const CONVERSION_CLICK_IDS_METADATA_KEY = "conversionClickIds";
const CONVERSION_ANALYTICS_AUTH_HEADER = "x-conversion-analytics-secret";
const STRIPE_METADATA_VALUE_MAX_LENGTH = 500;

type ConversionClickIds = {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbc?: string;
  fbp?: string;
};

type ServerConversionEvent = {
  name: "subscription_created" | "trial_started";
  id: string;
  timestamp: Date;
  attributionId?: string;
  properties?: {
    planId?: string;
    amount?: number;
    currency?: string;
  };
  clickIds?: ConversionClickIds;
  logger: Logger;
};

export async function trackServerConversionEvent({
  name,
  id,
  timestamp,
  attributionId,
  properties,
  clickIds,
  logger,
}: ServerConversionEvent) {
  if (!env.CONVERSION_ANALYTICS_SERVER_URL) return;

  try {
    const url = getServerConversionUrl(env.CONVERSION_ANALYTICS_SERVER_URL);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.CONVERSION_ANALYTICS_SERVER_SECRET
          ? {
              [CONVERSION_ANALYTICS_AUTH_HEADER]:
                env.CONVERSION_ANALYTICS_SERVER_SECRET,
            }
          : {}),
      },
      body: JSON.stringify({
        name,
        id,
        timestamp: timestamp.toISOString(),
        attributionId,
        properties,
        clickIds,
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

  const clickIds = getConversionClickIdsFromMetadata(
    subscription.metadata || {},
  );

  return {
    attributionId: subscription.metadata?.[CONVERSION_ATTRIBUTION_METADATA_KEY],
    ...(clickIds ? { clickIds } : {}),
    properties: {
      planId: price?.id,
      amount,
      currency: price?.currency?.toUpperCase(),
    },
  };
}

export function getConversionClickMetadata({
  utms,
  fbc,
  fbp,
}: {
  utms: Prisma.JsonValue | null | undefined;
  fbc?: string;
  fbp?: string;
}): Record<string, string> {
  const normalizedFbc = getStringValue(fbc);
  const normalizedFbp = getStringValue(fbp);
  const clickIds = {
    ...getConversionClickIdsFromObject(utms),
    ...(normalizedFbc ? { fbc: normalizedFbc } : {}),
    ...(normalizedFbp ? { fbp: normalizedFbp } : {}),
  };
  const serializedClickIds = JSON.stringify(clickIds);

  return Object.keys(clickIds).length &&
    serializedClickIds.length <= STRIPE_METADATA_VALUE_MAX_LENGTH
    ? { [CONVERSION_CLICK_IDS_METADATA_KEY]: serializedClickIds }
    : {};
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

function getConversionClickIdsFromMetadata(
  metadata: Stripe.Metadata,
): ConversionClickIds | undefined {
  const rawClickIds = metadata[CONVERSION_CLICK_IDS_METADATA_KEY];
  if (!rawClickIds) return;

  try {
    const clickIds = getConversionClickIdsFromObject(JSON.parse(rawClickIds));
    return Object.keys(clickIds).length ? clickIds : undefined;
  } catch {
    return;
  }
}

function getConversionClickIdsFromObject(
  value: Prisma.JsonValue | Record<string, unknown> | null | undefined,
): ConversionClickIds {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const gclid = getStringValue(value.gclid);
  const gbraid = getStringValue(value.gbraid);
  const wbraid = getStringValue(value.wbraid);
  const fbc = getStringValue(value.fbc);
  const fbp = getStringValue(value.fbp);

  return {
    ...(gclid ? { gclid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(fbc ? { fbc } : {}),
    ...(fbp ? { fbp } : {}),
  };
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
