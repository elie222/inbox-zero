import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { getStripeCancellationInitiatedAt } from "./cancellation-initiated";
import { processEvent } from "./route";
import { getStripeTrialConvertedAt } from "./trial-conversion";

const {
  mockSyncStripeDataToDb,
  mockSyncStripeInvoicePayment,
  mockSyncAiGenerationOverageForUpcomingInvoice,
  mockTrackStripeEvent,
  mockTrackBillingTrialStarted,
  mockTrackTrialStarted,
  mockTrackSubscriptionTrialStarted,
  mockFindUnique,
  mockUpdateMany,
  mockCompleteReferralAndGrantReward,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockSyncStripeDataToDb: vi.fn(),
  mockSyncStripeInvoicePayment: vi.fn(),
  mockSyncAiGenerationOverageForUpcomingInvoice: vi.fn(),
  mockTrackStripeEvent: vi.fn(),
  mockTrackBillingTrialStarted: vi.fn(),
  mockTrackTrialStarted: vi.fn(),
  mockTrackSubscriptionTrialStarted: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCompleteReferralAndGrantReward: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/ee/billing/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/utils/middleware", () => ({
  withError: vi.fn((_: string, handler: unknown) => handler),
}));

vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: mockSyncStripeDataToDb,
}));

vi.mock("@/ee/billing/stripe/payments", () => ({
  syncStripeInvoicePayment: mockSyncStripeInvoicePayment,
}));

vi.mock("@/ee/billing/stripe/ai-overage", () => ({
  syncAiGenerationOverageForUpcomingInvoice:
    mockSyncAiGenerationOverageForUpcomingInvoice,
}));

vi.mock("@/env", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  },
}));

vi.mock("@/utils/posthog", () => ({
  trackBillingTrialStarted: mockTrackBillingTrialStarted,
  trackStripeEvent: mockTrackStripeEvent,
  trackSubscriptionTrialStarted: mockTrackSubscriptionTrialStarted,
  trackTrialStarted: mockTrackTrialStarted,
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

const logger = createScopedLogger("stripe-webhook-route-test");

describe("processEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockSyncStripeInvoicePayment.mockResolvedValue(undefined);
    mockSyncAiGenerationOverageForUpcomingInvoice.mockResolvedValue(undefined);
    mockTrackStripeEvent.mockResolvedValue(undefined);
    mockTrackBillingTrialStarted.mockResolvedValue(undefined);
    mockTrackTrialStarted.mockResolvedValue(undefined);
    mockTrackSubscriptionTrialStarted.mockResolvedValue(undefined);
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
    expect(mockSyncAiGenerationOverageForUpcomingInvoice).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: "invoice.paid" }),
      logger,
    });
  });

  it("skips dependent billing syncs after customer sync fails", async () => {
    mockSyncStripeDataToDb.mockRejectedValue(new Error("sync failed"));

    await processEvent(invoiceEvent(), logger);

    expect(mockSyncStripeDataToDb).toHaveBeenCalledWith({
      customerId: "cus_test",
      logger,
    });
    expect(mockSyncStripeInvoicePayment).not.toHaveBeenCalled();
    expect(
      mockSyncAiGenerationOverageForUpcomingInvoice,
    ).not.toHaveBeenCalled();
  });
});

describe("getStripeTrialConvertedAt", () => {
  it("returns the event timestamp when a trial converts to active", () => {
    const event = subscriptionEvent({
      created: 1_700_000_000,
      data: {
        object: {
          status: "active",
          trial_end: 1_699_999_000,
        },
        previous_attributes: {
          status: "trialing",
        },
      },
    });

    expect(getStripeTrialConvertedAt(event)).toEqual(
      new Date("2023-11-14T22:13:20.000Z"),
    );
  });

  it("returns null when the subscription did not transition from trialing", () => {
    const event = subscriptionEvent({
      data: {
        object: {
          status: "active",
          trial_end: 1_699_999_000,
        },
        previous_attributes: {
          status: "incomplete",
        },
      },
    });

    expect(getStripeTrialConvertedAt(event)).toBeNull();
  });

  it("returns null when previous_attributes is undefined", () => {
    const event = subscriptionEvent({
      data: {
        object: {
          status: "active",
          trial_end: 1_699_999_000,
        },
      } as Stripe.Event.Data,
    });

    expect(getStripeTrialConvertedAt(event)).toBeNull();
  });

  it("returns null when the trial has not ended yet", () => {
    const event = subscriptionEvent({
      created: 1_700_000_000,
      data: {
        object: {
          status: "active",
          trial_end: 1_700_000_100,
        },
        previous_attributes: {
          status: "trialing",
        },
      },
    });

    expect(getStripeTrialConvertedAt(event)).toBeNull();
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
