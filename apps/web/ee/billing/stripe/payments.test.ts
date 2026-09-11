import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessorType } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";

const { mockFindUnique, mockUpsert } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    premium: {
      findUnique: mockFindUnique,
    },
    payment: {
      upsert: mockUpsert,
    },
  },
}));

const logger = createTestLogger();

describe("syncStripeInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a Stripe invoice into the Payment table", async () => {
    mockFindUnique.mockResolvedValue({ id: "premium_123" });

    const { syncStripeInvoicePayment } = await import("./payments");

    await syncStripeInvoicePayment({
      event: invoiceEvent({
        created: 1_700_000_500,
        type: "invoice.paid",
        data: {
          object: {
            id: "in_123",
            customer: "cus_123",
            parent: {
              subscription_details: {
                subscription: "sub_123",
              },
            },
            created: 1_700_000_000,
            currency: "usd",
            total: 2000,
            status: "paid",
            billing_reason: "subscription_cycle",
            total_taxes: [
              {
                amount: 300,
                tax_behavior: "exclusive",
                tax_rate_details: null,
                taxability_reason: "standard_rated",
                taxable_amount: 1700,
                type: "tax_rate_details",
              },
            ],
            status_transitions: {
              paid_at: 1_700_000_400,
            },
          },
        },
      }),
      logger,
    });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
      select: { id: true },
    });

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { processorId: "in_123" },
      create: expect.objectContaining({
        premiumId: "premium_123",
        processorType: ProcessorType.STRIPE,
        processorId: "in_123",
        processorSubscriptionId: "sub_123",
        processorCustomerId: "cus_123",
        amount: 2000,
        currency: "USD",
        status: "paid",
        tax: 300,
        taxInclusive: false,
        refunded: false,
        refundedAt: null,
        refundedAmount: null,
        billingReason: "subscription_cycle",
        createdAt: new Date("2023-11-14T22:13:20.000Z"),
        updatedAt: new Date("2023-11-14T22:20:00.000Z"),
      }),
      update: expect.objectContaining({
        premiumId: "premium_123",
        status: "paid",
      }),
    });
  });

  it("ignores non-invoice payment events", async () => {
    const { syncStripeInvoicePayment } = await import("./payments");

    await syncStripeInvoicePayment({
      event: {
        id: "evt_test",
        type: "customer.subscription.updated",
        object: "event",
        api_version: "2025-03-31.basil",
        created: 1,
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: {
          object: { id: "sub_123" },
        },
      } as Stripe.Event,
      logger,
    });

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("skips zero-amount invoices", async () => {
    const { syncStripeInvoicePayment } = await import("./payments");

    await syncStripeInvoicePayment({
      event: invoiceEvent({
        data: {
          object: {
            id: "in_zero",
            customer: "cus_123",
            created: 1_700_000_000,
            currency: "usd",
            total: 0,
            status: "paid",
            billing_reason: "subscription_cycle",
            total_taxes: [],
            status_transitions: {},
          },
        },
      }),
      logger,
    });

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

function invoiceEvent(overrides: Partial<Stripe.Event>): Stripe.Event {
  return {
    id: "evt_test",
    type: "invoice.paid",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "in_default",
        customer: "cus_default",
        parent: {
          subscription_details: {
            subscription: "sub_default",
          },
        },
        created: 1_700_000_000,
        currency: "usd",
        total: 1000,
        status: "paid",
        billing_reason: "subscription_cycle",
        total_taxes: [],
        status_transitions: {},
      },
    },
    ...overrides,
  } as Stripe.Event;
}
