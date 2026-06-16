import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/utils/logger";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    CONVERSION_ANALYTICS_SERVER_URL: "/rill",
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import {
  CONVERSION_ATTRIBUTION_METADATA_KEY,
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
      metadata: { [CONVERSION_ATTRIBUTION_METADATA_KEY]: "attr_test" },
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
      properties: {
        planId: "price_test",
        amount: 3000,
        currency: "USD",
      },
    });
  });
});
