import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/utils/logger";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    CONVERSION_ANALYTICS_SERVER_URL: "/rill",
    GOOGLE_ADS_DEVELOPER_TOKEN: undefined as string | undefined,
    GOOGLE_ADS_CLIENT_ID: undefined as string | undefined,
    GOOGLE_ADS_CLIENT_SECRET: undefined as string | undefined,
    GOOGLE_ADS_REFRESH_TOKEN: undefined as string | undefined,
    GOOGLE_ADS_CUSTOMER_ID: undefined as string | undefined,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: undefined as string | undefined,
    GOOGLE_ADS_SUBSCRIPTION_CONVERSION_ACTION_ID: undefined as
      | string
      | undefined,
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import {
  CONVERSION_ATTRIBUTION_METADATA_KEY,
  GOOGLE_ADS_GCLID_METADATA_KEY,
  getGoogleAdsClickMetadataFromUtms,
  getStripeSubscriptionConversionProperties,
  trackServerConversionEvent,
} from "@/utils/analytics/server-conversion-events";

describe("trackServerConversionEvent", () => {
  const fetchMock = vi.fn();
  const logger = {
    error: vi.fn(),
  } as unknown as Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CONVERSION_ANALYTICS_SERVER_URL = "/rill";
    envMock.GOOGLE_ADS_DEVELOPER_TOKEN = undefined;
    envMock.GOOGLE_ADS_CLIENT_ID = undefined;
    envMock.GOOGLE_ADS_CLIENT_SECRET = undefined;
    envMock.GOOGLE_ADS_REFRESH_TOKEN = undefined;
    envMock.GOOGLE_ADS_CUSTOMER_ID = undefined;
    envMock.GOOGLE_ADS_LOGIN_CUSTOMER_ID = undefined;
    envMock.GOOGLE_ADS_SUBSCRIPTION_CONVERSION_ACTION_ID = undefined;
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips tracking when no server conversion endpoint is configured", async () => {
    envMock.CONVERSION_ANALYTICS_SERVER_URL = "";

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      logger,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts conversion events to the configured private endpoint", async () => {
    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      attributionId: "attr_test",
      properties: {
        planId: "price_test",
        amount: 2900,
        currency: "USD",
      },
      logger,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/rill"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toEqual({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: "2026-06-08T00:00:00.000Z",
      attributionId: "attr_test",
      properties: {
        planId: "price_test",
        amount: 2900,
        currency: "USD",
      },
      sourceUrl: "https://example.com",
    });
  });

  it("uploads Google Ads click conversions when configured", async () => {
    envMock.CONVERSION_ANALYTICS_SERVER_URL = "";
    envMock.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    envMock.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";
    envMock.GOOGLE_ADS_CUSTOMER_ID = "774-909-8207";
    envMock.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "150-732-7907";
    envMock.GOOGLE_ADS_SUBSCRIPTION_CONVERSION_ACTION_ID = "7670913018";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{}] }),
      });

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      googleAdsClickIds: { gclid: "test-gclid" },
      properties: {
        amount: 2900,
        currency: "USD",
      },
      logger,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://googleads.googleapis.com/v24/customers/7749098207:uploadClickConversions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer access-token",
          "developer-token": "dev-token",
          "login-customer-id": "1507327907",
        }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body);
    expect(body).toEqual({
      conversions: [
        {
          conversionAction: "customers/7749098207/conversionActions/7670913018",
          gclid: "test-gclid",
          conversionDateTime: "2026-06-08 00:00:00+00:00",
          conversionValue: 29,
          currencyCode: "USD",
          orderId: "evt_paid",
        },
      ],
      partialFailure: true,
    });
  });

  it("logs and swallows Google Ads upload failures", async () => {
    envMock.CONVERSION_ANALYTICS_SERVER_URL = "";
    envMock.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    envMock.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";
    envMock.GOOGLE_ADS_CUSTOMER_ID = "7749098207";
    envMock.GOOGLE_ADS_SUBSCRIPTION_CONVERSION_ACTION_ID = "7670913018";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          partialFailureError: { message: "bad conversion" },
        }),
      });

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      googleAdsClickIds: { gclid: "test-gclid" },
      logger,
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Google Ads conversion upload failed",
      expect.objectContaining({ eventId: "evt_paid" }),
    );
  });

  it.each([
    "https://example.net/rill",
    "//example.net/rill",
    "rill",
  ])("does not post to non-relative server conversion endpoint %s", async (endpoint) => {
    envMock.CONVERSION_ANALYTICS_SERVER_URL = endpoint;

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      logger,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Server conversion tracking failed",
      expect.objectContaining({ eventId: "evt_paid" }),
    );
  });

  it("logs and swallows private endpoint failures", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      logger,
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Server conversion tracking failed",
      expect.objectContaining({ eventId: "evt_paid" }),
    );
  });
});

describe("getStripeSubscriptionConversionProperties", () => {
  it("extracts attribution and plan values from a Stripe subscription", () => {
    const subscription = {
      metadata: {
        [CONVERSION_ATTRIBUTION_METADATA_KEY]: "attr_test",
        [GOOGLE_ADS_GCLID_METADATA_KEY]: "test-gclid",
      },
      items: {
        data: [
          {
            quantity: 3,
            price: {
              id: "price_test",
              unit_amount: 1000,
              currency: "usd",
            },
          },
        ],
      },
    } as Stripe.Subscription;

    expect(getStripeSubscriptionConversionProperties(subscription)).toEqual({
      attributionId: "attr_test",
      googleAdsClickIds: {
        gclid: "test-gclid",
        gbraid: undefined,
        wbraid: undefined,
      },
      properties: {
        planId: "price_test",
        amount: 3000,
        currency: "USD",
      },
    });
  });

  it("extracts Google Ads click metadata from stored UTMs", () => {
    expect(
      getGoogleAdsClickMetadataFromUtms({
        gclid: "test-gclid",
        utmSource: "google",
      }),
    ).toEqual({
      [GOOGLE_ADS_GCLID_METADATA_KEY]: "test-gclid",
    });
  });
});
