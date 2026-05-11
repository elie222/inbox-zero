import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const { mockChargeRetrieve, mockPaymentIntentRetrieve, mockInvoiceRetrieve } =
  vi.hoisted(() => ({
    mockChargeRetrieve: vi.fn(),
    mockPaymentIntentRetrieve: vi.fn(),
    mockInvoiceRetrieve: vi.fn(),
  }));

vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    charges: {
      retrieve: mockChargeRetrieve,
    },
    paymentIntents: {
      retrieve: mockPaymentIntentRetrieve,
    },
    invoices: {
      retrieve: mockInvoiceRetrieve,
    },
  }),
}));

const logger = createTestLogger();

describe("getStripeCustomerIdForRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the customer from the refund charge", async () => {
    mockChargeRetrieve.mockResolvedValue({
      customer: "cus_123",
    });

    const { getStripeCustomerIdForRefund } = await import("./refunds");

    await expect(
      getStripeCustomerIdForRefund(refund({ charge: "ch_123" })),
    ).resolves.toBe("cus_123");

    expect(mockChargeRetrieve).toHaveBeenCalledWith("ch_123");
    expect(mockPaymentIntentRetrieve).not.toHaveBeenCalled();
  });

  it("falls back to the payment intent when the refund has no charge", async () => {
    mockPaymentIntentRetrieve.mockResolvedValue({
      customer: "cus_123",
    });

    const { getStripeCustomerIdForRefund } = await import("./refunds");

    await expect(
      getStripeCustomerIdForRefund(
        refund({
          charge: null,
          payment_intent: "pi_123",
        }),
      ),
    ).resolves.toBe("cus_123");

    expect(mockPaymentIntentRetrieve).toHaveBeenCalledWith("pi_123");
  });
});

describe("getStripeInvoiceForRefundEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the source invoice for refund payment syncing", async () => {
    const invoice = {
      id: "in_123",
      customer: "cus_123",
    };

    mockChargeRetrieve.mockResolvedValue({
      invoice: "in_123",
    });
    mockInvoiceRetrieve.mockResolvedValue(invoice);

    const { getStripeInvoiceForRefundEvent } = await import("./refunds");

    await expect(
      getStripeInvoiceForRefundEvent({
        refund: refund({ charge: "ch_123" }),
        logger,
        eventType: "refund.created",
      }),
    ).resolves.toBe(invoice);

    expect(mockInvoiceRetrieve).toHaveBeenCalledWith("in_123", {
      expand: ["charge", "charge.refunds"],
    });
  });
});

describe("getStripeRefundState", () => {
  it("returns refunded payment metadata from the invoice charge", async () => {
    const { getStripeRefundState } = await import("./refunds");

    expect(
      getStripeRefundState({
        total: 2000,
        status: "paid",
        charge: {
          amount_refunded: 500,
          refunds: {
            data: [
              {
                created: 1_700_000_450,
                status: "succeeded",
              },
            ],
          },
        },
      } as Stripe.Invoice),
    ).toEqual({
      status: "partially_refunded",
      refunded: true,
      refundedAt: new Date("2023-11-14T22:20:50.000Z"),
      refundedAmount: 500,
    });
  });

  it("treats a fully refunded discounted charge as refunded", async () => {
    const { getStripeRefundState } = await import("./refunds");

    expect(
      getStripeRefundState({
        total: 2000,
        status: "paid",
        charge: {
          amount: 1500,
          amount_refunded: 1500,
          refunds: {
            data: [
              {
                created: 1_700_000_450,
                status: "succeeded",
              },
            ],
          },
        },
      } as Stripe.Invoice),
    ).toEqual({
      status: "refunded",
      refunded: true,
      refundedAt: new Date("2023-11-14T22:20:50.000Z"),
      refundedAmount: 1500,
    });
  });
});

function refund(overrides: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    id: "re_123",
    charge: null,
    payment_intent: null,
    ...overrides,
  } as Stripe.Refund;
}
