import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/utils/logger";

const { envMock, publishToQstashMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    CONVERSION_ANALYTICS_SERVER_URL: "/rill",
    CONVERSION_ANALYTICS_SERVER_SECRET: undefined as string | undefined,
  },
  publishToQstashMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/upstash", () => ({
  publishToQstash: publishToQstashMock,
}));

import {
  CONVERSION_CLICK_IDS_METADATA_KEY,
  CONVERSION_ATTRIBUTION_METADATA_KEY,
  getConversionClickMetadata,
  getStripeSubscriptionConversionProperties,
  trackServerConversionEvent,
} from "@/utils/analytics/server-conversion-events";

describe("trackServerConversionEvent", () => {
  const logger = {
    error: vi.fn(),
  } as unknown as Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CONVERSION_ANALYTICS_SERVER_URL = "/rill";
    envMock.CONVERSION_ANALYTICS_SERVER_SECRET = undefined;
    publishToQstashMock.mockResolvedValue(undefined);
  });

  it("skips tracking when no server conversion endpoint is configured", async () => {
    envMock.CONVERSION_ANALYTICS_SERVER_URL = "";

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      logger,
    });

    expect(publishToQstashMock).not.toHaveBeenCalled();
  });

  it("posts conversion events to the configured private endpoint", async () => {
    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      attributionId: "attr_test",
      clickIds: {
        gclid: "test-gclid",
      },
      properties: {
        planId: "price_test",
        amount: 2900,
        currency: "USD",
      },
      logger,
    });

    expect(publishToQstashMock).toHaveBeenCalledWith(
      "/rill",
      expect.any(Object),
      undefined,
      undefined,
    );

    const body = publishToQstashMock.mock.calls[0]?.[1];
    expect(body).toEqual({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: "2026-06-08T00:00:00.000Z",
      attributionId: "attr_test",
      clickIds: {
        gclid: "test-gclid",
      },
      properties: {
        planId: "price_test",
        amount: 2900,
        currency: "USD",
      },
      sourceUrl: "https://example.com",
    });
  });

  it("posts trial-start conversion events to the configured private endpoint", async () => {
    await trackServerConversionEvent({
      name: "trial_started",
      id: "evt_trial:trial_started",
      timestamp: new Date("2026-07-13T00:00:00.000Z"),
      clickIds: { gclid: "test-gclid" },
      properties: { planId: "price_test" },
      logger,
    });

    const body = publishToQstashMock.mock.calls[0]?.[1];
    expect(body).toEqual({
      name: "trial_started",
      id: "evt_trial:trial_started",
      timestamp: "2026-07-13T00:00:00.000Z",
      clickIds: { gclid: "test-gclid" },
      properties: { planId: "price_test" },
      sourceUrl: "https://example.com",
    });
  });

  it("hands Apple subscription state to the private endpoint", async () => {
    await trackServerConversionEvent({
      name: "apple_subscription_synced",
      id: "transaction-1:user-1",
      timestamp: new Date("2026-07-18T00:00:00.000Z"),
      userId: "user-1",
      properties: {
        planId: "com.getinboxzero.pro.monthly",
        amount: 29,
        currency: "USD",
        currentOfferDiscountType: null,
        currentSubscriptionStatus: "ACTIVE",
        environment: "Production",
        originalTransactionId: "original-1",
        previousOfferDiscountType: "FREE_TRIAL",
        previousSubscriptionStatus: "ACTIVE",
      },
      logger,
    });

    const body = publishToQstashMock.mock.calls[0]?.[1];
    expect(body).toEqual({
      name: "apple_subscription_synced",
      id: "transaction-1:user-1",
      timestamp: "2026-07-18T00:00:00.000Z",
      userId: "user-1",
      properties: {
        planId: "com.getinboxzero.pro.monthly",
        amount: 29,
        currency: "USD",
        currentOfferDiscountType: null,
        currentSubscriptionStatus: "ACTIVE",
        environment: "Production",
        originalTransactionId: "original-1",
        previousOfferDiscountType: "FREE_TRIAL",
        previousSubscriptionStatus: "ACTIVE",
      },
      sourceUrl: "https://example.com",
    });
  });

  it("sends the shared secret header when configured", async () => {
    envMock.CONVERSION_ANALYTICS_SERVER_SECRET = "secret_test";

    await trackServerConversionEvent({
      name: "subscription_created",
      id: "evt_paid",
      timestamp: new Date("2026-06-08T00:00:00.000Z"),
      logger,
    });

    expect(publishToQstashMock).toHaveBeenCalledWith(
      "/rill",
      expect.any(Object),
      undefined,
      { "x-conversion-analytics-secret": "secret_test" },
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

    expect(publishToQstashMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Server conversion tracking failed",
      expect.objectContaining({ eventId: "evt_paid" }),
    );
  });

  it("logs and swallows private endpoint failures", async () => {
    publishToQstashMock.mockRejectedValue(new Error("Delivery failed"));

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
        [CONVERSION_CLICK_IDS_METADATA_KEY]: JSON.stringify({
          gclid: " test-gclid ",
          gbraid: "test-gbraid",
          wbraid: "test-wbraid",
          fbc: "fb.1.click",
          fbp: "fb.1.browser",
        }),
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
      clickIds: {
        gclid: "test-gclid",
        gbraid: "test-gbraid",
        wbraid: "test-wbraid",
        fbc: "fb.1.click",
        fbp: "fb.1.browser",
      },
      properties: {
        planId: "price_test",
        amount: 3000,
        currency: "USD",
      },
    });
  });

  it("extracts conversion click metadata from stored UTMs", () => {
    expect(
      getConversionClickMetadata({
        utms: {
          gclid: " test-gclid ",
          gbraid: "test-gbraid",
          wbraid: "test-wbraid",
          utmSource: "google",
        },
        fbc: "fb.1.click",
        fbp: "fb.1.browser",
      }),
    ).toEqual({
      [CONVERSION_CLICK_IDS_METADATA_KEY]: JSON.stringify({
        gclid: "test-gclid",
        gbraid: "test-gbraid",
        wbraid: "test-wbraid",
        fbc: "fb.1.click",
        fbp: "fb.1.browser",
      }),
    });
  });

  it("drops click metadata when it would exceed Stripe metadata limits", () => {
    expect(
      getConversionClickMetadata({
        utms: { gclid: "x".repeat(501) },
      }),
    ).toEqual({});
  });
});
