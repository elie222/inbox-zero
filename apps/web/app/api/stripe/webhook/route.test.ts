import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { getStripeCancellationInitiatedAt } from "./cancellation-initiated";
import { processEvent } from "./controller";

const {
  mockSyncStripeDataToDb,
  mockSyncStripeInvoicePayment,
  mockEnqueueStripeInvoiceEmail,
  mockSyncAiGenerationOverageForUpcomingInvoice,
  mockTrackStripeEvent,
  mockGetCheckoutSessionIdHash,
  mockTrackBillingTrialStarted,
  mockTrackTrialStarted,
  mockTrackSubscriptionTrialStarted,
  mockTrackServerConversionEvent,
  mockSendFacebookConversionEvent,
  mockFindUnique,
  mockUpdateMany,
  mockCompleteReferralAndGrantReward,
  mockCaptureException,
  mockGetStripeTrialConversion,
  mockAfter,
} = vi.hoisted(() => ({
  mockSyncStripeDataToDb: vi.fn(),
  mockSyncStripeInvoicePayment: vi.fn(),
  mockEnqueueStripeInvoiceEmail: vi.fn(),
  mockSyncAiGenerationOverageForUpcomingInvoice: vi.fn(),
  mockTrackStripeEvent: vi.fn(),
  mockGetCheckoutSessionIdHash: vi.fn(
    (checkoutSessionId: string) => `hashed:${checkoutSessionId}`,
  ),
  mockTrackBillingTrialStarted: vi.fn(),
  mockTrackTrialStarted: vi.fn(),
  mockTrackSubscriptionTrialStarted: vi.fn(),
  mockTrackServerConversionEvent: vi.fn(),
  mockSendFacebookConversionEvent: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCompleteReferralAndGrantReward: vi.fn(),
  mockCaptureException: vi.fn(),
  mockGetStripeTrialConversion: vi.fn(),
  mockAfter: vi.fn(),
}));

vi.mock("./trial-conversion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./trial-conversion")>()),
  getStripeTrialConversion: mockGetStripeTrialConversion,
}));

vi.mock("next/server", () => ({ after: mockAfter }));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/ee/billing/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: mockSyncStripeDataToDb,
}));

vi.mock("@/ee/billing/stripe/payments", () => ({
  syncStripeInvoicePayment: mockSyncStripeInvoicePayment,
}));

vi.mock("@/ee/billing/stripe/invoice-email", () => ({
  enqueueStripeInvoiceEmail: mockEnqueueStripeInvoiceEmail,
}));

vi.mock("@/ee/billing/stripe/ai-overage", () => ({
  syncAiGenerationOverageForUpcomingInvoice:
    mockSyncAiGenerationOverageForUpcomingInvoice,
}));

vi.mock("@/env", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    NEXT_PUBLIC_BASE_URL: "https://example.com",
  },
}));

vi.mock("@/utils/posthog", () => ({
  getCheckoutSessionIdHash: mockGetCheckoutSessionIdHash,
  trackBillingTrialStarted: mockTrackBillingTrialStarted,
  trackStripeEvent: mockTrackStripeEvent,
  trackSubscriptionTrialStarted: mockTrackSubscriptionTrialStarted,
  trackTrialStarted: mockTrackTrialStarted,
}));

vi.mock("@/utils/analytics/server-conversion-events", () => ({
  getStripeSubscriptionConversionProperties: vi.fn((subscription) => ({
    attributionId: subscription.metadata?.conversionAttributionId,
    clickIds: subscription.metadata?.conversionClickIds
      ? JSON.parse(subscription.metadata.conversionClickIds)
      : undefined,
    properties: {
      planId: subscription.items?.data?.[0]?.price?.id,
      amount:
        subscription.items?.data?.[0]?.price?.unit_amount *
        (subscription.items?.data?.[0]?.quantity || 1),
      currency: subscription.items?.data?.[0]?.price?.currency?.toUpperCase(),
    },
  })),
  trackServerConversionEvent: mockTrackServerConversionEvent,
}));

vi.mock("@/utils/fb", () => ({
  sendFacebookConversionEvent: mockSendFacebookConversionEvent,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    premium: {
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}));

vi.mock("@/utils/referral/referral-tracking", () => ({
  completeReferralAndGrantReward: mockCompleteReferralAndGrantReward,
}));

vi.mock("@/utils/error", () => ({
  captureException: mockCaptureException,
}));

const logger = createTestLogger();

describe("processEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStripeTrialConversion.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockSyncStripeInvoicePayment.mockResolvedValue(undefined);
    mockEnqueueStripeInvoiceEmail.mockResolvedValue(undefined);
    mockSyncAiGenerationOverageForUpcomingInvoice.mockResolvedValue(undefined);
    mockTrackStripeEvent.mockResolvedValue(undefined);
    mockTrackBillingTrialStarted.mockResolvedValue(undefined);
    mockTrackTrialStarted.mockResolvedValue(undefined);
    mockTrackSubscriptionTrialStarted.mockResolvedValue(undefined);
    mockTrackServerConversionEvent.mockResolvedValue(undefined);
    mockSendFacebookConversionEvent.mockResolvedValue(undefined);
    mockCompleteReferralAndGrantReward.mockResolvedValue(undefined);
  });

  it("syncs invoice payments after customer sync succeeds", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);

    await processEvent(invoiceEvent(), logger);

    expect(mockSyncStripeDataToDb).toHaveBeenCalledWith({
      customerId: "cus_test",
      logger,
    });
    expect(mockSyncStripeInvoicePayment).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: "invoice.paid" }),
      logger,
    });
    expect(mockEnqueueStripeInvoiceEmail).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: "invoice.paid" }),
      logger,
    });
    expect(mockSyncAiGenerationOverageForUpcomingInvoice).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: "invoice.paid" }),
      logger,
    });
  });

  it("continues billing syncs when customer email lookup fails", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockRejectedValueOnce(new Error("lookup failed"));

    await processEvent(invoiceEvent(), logger);

    expect(mockTrackStripeEvent).toHaveBeenCalledWith(
      "Unknown",
      expect.objectContaining({
        id: "evt_invoice_test",
        type: "invoice.paid",
      }),
    );
    expect(mockSyncStripeInvoicePayment).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: "invoice.paid" }),
      logger,
    });
    expect(mockSyncAiGenerationOverageForUpcomingInvoice).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: "invoice.paid" }),
      logger,
    });
  });

  it("adds a private correlation key for a verified checkout completion", async () => {
    await processEvent(checkoutCompletedEvent(), logger);

    expect(mockTrackStripeEvent).toHaveBeenCalledWith(
      "Unknown",
      expect.objectContaining({
        checkoutSessionIdHash: "hashed:cs_test",
        id: "evt_checkout_test",
        type: "checkout.session.completed",
      }),
    );
    expect(mockGetCheckoutSessionIdHash).toHaveBeenCalledWith("cs_test");
  });

  it("skips dependent billing syncs after customer sync fails", async () => {
    mockSyncStripeDataToDb.mockRejectedValue(new Error("sync failed"));

    await processEvent(invoiceEvent(), logger);

    expect(mockSyncStripeDataToDb).toHaveBeenCalledWith({
      customerId: "cus_test",
      logger,
    });
    expect(mockSyncStripeInvoicePayment).not.toHaveBeenCalled();
    expect(mockEnqueueStripeInvoiceEmail).not.toHaveBeenCalled();
    expect(
      mockSyncAiGenerationOverageForUpcomingInvoice,
    ).not.toHaveBeenCalled();
  });

  it("does not convert a trial until payment succeeds", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "premium_test",
      users: [{ id: "user_test", email: "user@example.com" }],
    });

    await processEvent(
      subscriptionEvent({
        created: 1_700_000_000,
        data: {
          object: {
            id: "sub_test",
            customer: "cus_test",
            status: "active",
            trial_end: 1_699_999_000,
          },
          previous_attributes: { status: "trialing" },
        } as Stripe.Event.Data,
      }),
      logger,
    );

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCompleteReferralAndGrantReward).not.toHaveBeenCalled();
    expect(mockTrackServerConversionEvent).not.toHaveBeenCalled();
    expect(mockSendFacebookConversionEvent).not.toHaveBeenCalled();
  });

  it("does not delay successful invoice acknowledgement for non-critical tracking", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    let finishTracking: () => void = () => {};
    mockTrackStripeEvent.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishTracking = resolve;
        }),
    );
    await processEvent(
      invoiceEvent({ type: "invoice.payment_succeeded" }),
      logger,
    );
    expect(mockAfter).toHaveBeenCalledTimes(1);
    finishTracking();
    await mockAfter.mock.calls[0][0]();
  });

  it("propagates identity lookup failure before acknowledging a successful invoice", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockRejectedValueOnce(new Error("lookup failed"));
    await expect(
      processEvent(invoiceEvent({ type: "invoice.payment_succeeded" }), logger),
    ).rejects.toThrow("lookup failed");
  });

  it("propagates customer sync failure for successful invoice delivery retries", async () => {
    mockSyncStripeDataToDb.mockRejectedValue(new Error("sync failed"));
    await expect(
      processEvent(invoiceEvent({ type: "invoice.payment_succeeded" }), logger),
    ).rejects.toThrow("sync failed");
  });

  it("propagates conversion failure so successful invoice delivery can retry", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "premium_test",
      stripeSubscriptionId: "sub_test",
      users: [],
    });
    mockGetStripeTrialConversion.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );
    await expect(
      processEvent(invoiceEvent({ type: "invoice.payment_succeeded" }), logger),
    ).rejects.toThrow("Stripe unavailable");
  });

  it("ignores a payment that loses the atomic conversion claim", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "premium_test",
      stripeSubscriptionId: "sub_test",
      stripeTrialConvertedAt: null,
      users: [{ id: "user_test", email: "user@example.com" }],
    });
    mockGetStripeTrialConversion.mockResolvedValue({
      subscription: {
        id: "sub_test",
        metadata: {},
        items: {
          data: [
            {
              quantity: 1,
              price: { id: "price_test", unit_amount: 2000, currency: "usd" },
            },
          ],
        },
      },
      invoice: { id: "in_test", amount_paid: 1500, currency: "usd" },
      convertedAt: new Date("2023-11-14T22:13:20Z"),
    });
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    const event = invoiceEvent({ type: "invoice.payment_succeeded" });
    await processEvent(event, logger);
    await processEvent({ ...event, id: "evt_duplicate" }, logger);

    expect(mockCompleteReferralAndGrantReward).toHaveBeenCalledTimes(1);
    expect(mockTrackServerConversionEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackServerConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "subscription_created",
        id: "in_test:trial_converted",
        timestamp: new Date("2023-11-14T22:13:20Z"),
        properties: { planId: "price_test", amount: 1500, currency: "USD" },
      }),
    );
    expect(mockSendFacebookConversionEvent).toHaveBeenCalledTimes(1);
    expect(mockSendFacebookConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "in_test:trial_converted",
        customData: { currency: "USD", value: 15, content_name: "price_test" },
      }),
    );
  });

  it("retries conversion side effects for the same recorded invoice with a stable identity", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "premium_test",
      stripeSubscriptionId: "sub_test",
      stripeTrialConvertedAt: new Date("2023-11-14T22:13:20Z"),
      stripeTrialConversionInvoiceId: "in_test",
      users: [{ id: "user_test", email: "user@example.com" }],
    });
    mockGetStripeTrialConversion.mockResolvedValue({
      subscription: { id: "sub_test", metadata: {}, items: { data: [] } },
      invoice: { id: "in_test", amount_paid: 1500, currency: "usd" },
      convertedAt: new Date("2023-11-14T22:13:20Z"),
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockSendFacebookConversionEvent.mockRejectedValueOnce(
      new Error("delivery unavailable"),
    );
    await expect(
      processEvent(invoiceEvent({ type: "invoice.payment_succeeded" }), logger),
    ).rejects.toThrow("delivery unavailable");
    await processEvent(
      invoiceEvent({ type: "invoice.payment_succeeded" }),
      logger,
    );
    expect(mockCompleteReferralAndGrantReward).toHaveBeenCalledTimes(2);
    expect(mockTrackServerConversionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "in_test:trial_converted" }),
    );
  });

  it("does not mark a replacement subscription from an older subscription payment", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "premium_test",
      stripeSubscriptionId: "sub_replacement",
      users: [],
    });
    mockGetStripeTrialConversion.mockResolvedValue({
      subscription: { id: "sub_old" },
    });
    await processEvent(
      invoiceEvent({ type: "invoice.payment_succeeded" }),
      logger,
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockTrackServerConversionEvent).not.toHaveBeenCalled();
  });

  it("tracks a trial-start conversion from a new trialing subscription", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "premium_test",
      users: [{ id: "user_test", email: "user@example.com" }],
    });

    await processEvent(
      subscriptionEvent({
        id: "evt_trial_started",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_test",
            customer: "cus_test",
            status: "trialing",
            trial_start: 1_700_000_000,
            metadata: {
              conversionAttributionId: "attr_test",
              conversionClickIds: JSON.stringify({
                fbc: "fb.1.click",
                fbp: "fb.1.browser",
              }),
            },
            items: {
              data: [
                {
                  quantity: 1,
                  price: {
                    id: "price_test",
                    unit_amount: 2000,
                    currency: "usd",
                  },
                },
              ],
            },
          },
        } as Stripe.Event.Data,
      }),
      logger,
    );

    expect(mockTrackServerConversionEvent).toHaveBeenCalledWith({
      name: "trial_started",
      id: "evt_trial_started:trial_started",
      timestamp: new Date("2023-11-14T22:13:20.000Z"),
      attributionId: "attr_test",
      properties: {
        planId: "price_test",
        amount: 2000,
        currency: "USD",
      },
      clickIds: {
        fbc: "fb.1.click",
        fbp: "fb.1.browser",
      },
      logger,
    });
    expect(mockSendFacebookConversionEvent).toHaveBeenCalledWith({
      eventName: "StartTrial",
      eventTime: new Date("2023-11-14T22:13:20.000Z"),
      eventId: "evt_trial_started:trial_started",
      eventSourceUrl: "https://example.com",
      userId: "user_test",
      email: "user@example.com",
      fbc: "fb.1.click",
      fbp: "fb.1.browser",
      customData: {
        currency: "USD",
        value: 0,
        content_name: "price_test",
      },
    });
  });

  it("does not track paid subscription conversions for non-conversion updates", async () => {
    mockSyncStripeDataToDb.mockResolvedValue(undefined);

    await processEvent(
      subscriptionEvent({
        data: {
          object: {
            customer: "cus_test",
            status: "active",
            trial_end: 1_699_999_000,
          },
          previous_attributes: {
            status: "incomplete",
          },
        } as Stripe.Event.Data,
      }),
      logger,
    );

    expect(mockTrackServerConversionEvent).not.toHaveBeenCalled();
  });
});

describe("getStripeCancellationInitiatedAt", () => {
  it("returns the event timestamp when cancel_at transitions from null to set", () => {
    const event = subscriptionEvent({
      created: 1_700_000_000,
      data: {
        object: {
          cancel_at: 1_700_999_000,
          cancel_at_period_end: false,
        },
        previous_attributes: {
          cancel_at: null,
        },
      },
    });

    expect(getStripeCancellationInitiatedAt(event)).toEqual(
      new Date("2023-11-14T22:13:20.000Z"),
    );
  });

  it("returns the event timestamp when cancel_at_period_end flips to true", () => {
    const event = subscriptionEvent({
      created: 1_700_000_000,
      data: {
        object: {
          cancel_at_period_end: true,
        },
        previous_attributes: {
          cancel_at_period_end: false,
        },
      },
    });

    expect(getStripeCancellationInitiatedAt(event)).toEqual(
      new Date("2023-11-14T22:13:20.000Z"),
    );
  });

  it("returns null when cancel_at was already set previously", () => {
    const event = subscriptionEvent({
      created: 1_700_000_000,
      data: {
        object: {
          cancel_at: 1_700_999_500,
        },
        previous_attributes: {
          cancel_at: 1_700_999_000,
        },
      },
    });

    expect(getStripeCancellationInitiatedAt(event)).toBeNull();
  });

  it("returns null when previous_attributes is undefined", () => {
    const event = subscriptionEvent({
      data: {
        object: {
          cancel_at: 1_700_999_000,
          cancel_at_period_end: true,
        },
      } as Stripe.Event.Data,
    });

    expect(getStripeCancellationInitiatedAt(event)).toBeNull();
  });

  it("returns null for non-subscription-updated events", () => {
    const event = invoiceEvent();
    expect(getStripeCancellationInitiatedAt(event)).toBeNull();
  });
});

function invoiceEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_invoice_test",
    type: "invoice.paid",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1_700_000_500,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "in_test",
        customer: "cus_test",
        created: 1_700_000_000,
        status: "paid",
      },
    },
    ...overrides,
  } as Stripe.Event;
}

function checkoutCompletedEvent(): Stripe.Event {
  return {
    id: "evt_checkout_test",
    type: "checkout.session.completed",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1_700_000_500,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "cs_test",
        customer: "cus_test",
        status: "complete",
      },
    },
  } as Stripe.Event;
}

function subscriptionEvent(overrides: Partial<Stripe.Event>): Stripe.Event {
  return {
    id: "evt_test",
    type: "customer.subscription.updated",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "sub_test",
        customer: "cus_test",
        status: "trialing",
        trial_end: null,
      },
      previous_attributes: {},
    },
    ...overrides,
  } as Stripe.Event;
}
