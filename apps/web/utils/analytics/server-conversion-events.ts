import type Stripe from "stripe";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

export const CONVERSION_ATTRIBUTION_COOKIE = "iz_conversion_ref";
export const CONVERSION_ATTRIBUTION_METADATA_KEY = "conversionAttributionId";
export const GOOGLE_ADS_GCLID_METADATA_KEY = "googleAdsGclid";
export const GOOGLE_ADS_GBRAID_METADATA_KEY = "googleAdsGbraid";
export const GOOGLE_ADS_WBRAID_METADATA_KEY = "googleAdsWbraid";

type GoogleAdsClickIds = {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
};

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
  googleAdsClickIds?: GoogleAdsClickIds;
  logger: Logger;
};

export async function trackServerConversionEvent({
  name,
  id,
  timestamp,
  attributionId,
  properties,
  googleAdsClickIds,
  logger,
}: ServerConversionEvent) {
  await Promise.allSettled([
    trackPrivateServerConversionEvent({
      name,
      id,
      timestamp,
      attributionId,
      properties,
      logger,
    }),
    uploadGoogleAdsClickConversion({
      id,
      timestamp,
      googleAdsClickIds,
      properties,
      logger,
    }),
  ]);
}

async function trackPrivateServerConversionEvent({
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
    googleAdsClickIds: getGoogleAdsClickIdsFromMetadata(
      subscription.metadata || {},
    ),
    properties: {
      planId: price?.id,
      amount,
      currency: price?.currency?.toUpperCase(),
    },
  };
}

export function getGoogleAdsClickMetadataFromUtms(
  utms: Prisma.JsonValue | null | undefined,
) {
  const clickIds = getGoogleAdsClickIdsFromUtms(utms);

  return {
    ...(clickIds.gclid
      ? { [GOOGLE_ADS_GCLID_METADATA_KEY]: clickIds.gclid }
      : {}),
    ...(clickIds.gbraid
      ? { [GOOGLE_ADS_GBRAID_METADATA_KEY]: clickIds.gbraid }
      : {}),
    ...(clickIds.wbraid
      ? { [GOOGLE_ADS_WBRAID_METADATA_KEY]: clickIds.wbraid }
      : {}),
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

function getGoogleAdsClickIdsFromUtms(
  utms: Prisma.JsonValue | null | undefined,
): GoogleAdsClickIds {
  if (!utms || typeof utms !== "object" || Array.isArray(utms)) return {};

  return {
    gclid: getStringValue(utms.gclid),
    gbraid: getStringValue(utms.gbraid),
    wbraid: getStringValue(utms.wbraid),
  };
}

function getGoogleAdsClickIdsFromMetadata(
  metadata: Stripe.Metadata,
): GoogleAdsClickIds {
  return {
    gclid: getStringValue(metadata[GOOGLE_ADS_GCLID_METADATA_KEY]),
    gbraid: getStringValue(metadata[GOOGLE_ADS_GBRAID_METADATA_KEY]),
    wbraid: getStringValue(metadata[GOOGLE_ADS_WBRAID_METADATA_KEY]),
  };
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function uploadGoogleAdsClickConversion({
  id,
  timestamp,
  googleAdsClickIds,
  properties,
  logger,
}: Pick<
  ServerConversionEvent,
  "id" | "timestamp" | "googleAdsClickIds" | "properties" | "logger"
>) {
  const googleAdsConfig = getGoogleAdsConfig();
  if (!googleAdsConfig) return;

  const clickId = getGoogleAdsClickId(googleAdsClickIds);
  if (!clickId) return;

  try {
    const accessToken = await getGoogleAdsAccessToken(googleAdsConfig);
    const response = await fetch(
      `https://googleads.googleapis.com/v24/customers/${googleAdsConfig.customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "developer-token": googleAdsConfig.developerToken,
          ...(googleAdsConfig.loginCustomerId
            ? { "login-customer-id": googleAdsConfig.loginCustomerId }
            : {}),
        },
        body: JSON.stringify({
          conversions: [
            {
              conversionAction: `customers/${googleAdsConfig.customerId}/conversionActions/${googleAdsConfig.conversionActionId}`,
              ...clickId,
              conversionDateTime: formatGoogleAdsDateTime(timestamp),
              conversionValue: getConversionValue(properties?.amount),
              currencyCode: properties?.currency || "USD",
              orderId: id,
            },
          ],
          partialFailure: true,
        }),
      },
    );

    const body = await response.json().catch(() => undefined);
    if (!response.ok || body?.partialFailureError) {
      throw new Error(
        `Google Ads conversion upload failed: ${response.status} ${JSON.stringify(
          body,
        )}`,
      );
    }
  } catch (error) {
    logger.error("Google Ads conversion upload failed", {
      error,
      eventId: id,
    });
  }
}

function getGoogleAdsConfig() {
  const clientId = env.GOOGLE_ADS_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_ADS_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
  const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refreshToken = env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = env.GOOGLE_ADS_CUSTOMER_ID?.replaceAll("-", "");
  const conversionActionId = env.GOOGLE_ADS_SUBSCRIPTION_CONVERSION_ACTION_ID;
  const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replaceAll("-", "");

  if (
    !clientId ||
    !clientSecret ||
    !developerToken ||
    !refreshToken ||
    !customerId ||
    !conversionActionId
  ) {
    return;
  }

  return {
    clientId,
    clientSecret,
    developerToken,
    refreshToken,
    customerId,
    conversionActionId,
    loginCustomerId,
  };
}

async function getGoogleAdsAccessToken({
  clientId,
  clientSecret,
  refreshToken,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = await response.json().catch(() => undefined);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Google Ads OAuth refresh failed: ${response.status}`);
  }

  return body.access_token as string;
}

function getGoogleAdsClickId(clickIds: GoogleAdsClickIds | undefined) {
  if (clickIds?.gclid) return { gclid: clickIds.gclid };
  if (clickIds?.gbraid) return { gbraid: clickIds.gbraid };
  if (clickIds?.wbraid) return { wbraid: clickIds.wbraid };
}

function getConversionValue(amountInCents: number | undefined) {
  if (typeof amountInCents !== "number") return 0;
  return amountInCents / 100;
}

function formatGoogleAdsDateTime(date: Date) {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "+00:00");
}
