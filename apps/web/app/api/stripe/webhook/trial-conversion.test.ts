import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeTrialConversion } from "./trial-conversion";

vi.mock("@/utils/prisma");

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  retrieveInvoice: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mocks.retrieve },
    invoices: { retrieve: mocks.retrieveInvoice, list: mocks.list },
  }),
}));

const trialEnd = 1_700_000_000;

describe("getStripeTrialConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retrieve.mockResolvedValue({ id: "sub_test", trial_end: trialEnd });
    mocks.retrieveInvoice.mockResolvedValue(paymentEvent().data.object);
    mocks.list.mockReturnValue([]);
  });

  it("uses the fetched invoice when the webhook payload is stale", async () => {
    const invoice = paymentEvent({ amount_paid: 1500 }).data.object;
    mocks.retrieveInvoice.mockResolvedValue(invoice);
    expect(
      await getStripeTrialConversion(paymentEvent({ amount_paid: 0 })),
    ).toMatchObject({ invoice });
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith("in_test");
  });

  it("does not count a payment when the fetched invoice is unpaid", async () => {
    mocks.retrieveInvoice.mockResolvedValue(
      paymentEvent({ status: "open", amount_paid: 0 }).data.object,
    );
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it("propagates invoice retrieval failures so delivery can retry", async () => {
    mocks.retrieveInvoice.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );
    await expect(getStripeTrialConversion(paymentEvent())).rejects.toThrow(
      "Stripe unavailable",
    );
  });

  it("uses the successful payment time after a failed first attempt", async () => {
    const event = paymentEvent({
      status_transitions: { paid_at: trialEnd + 86_400 },
    });
    mocks.retrieveInvoice.mockResolvedValue(event.data.object);
    expect(await getStripeTrialConversion(event)).toEqual({
      subscription: { id: "sub_test", trial_end: trialEnd },
      invoice: event.data.object,
      convertedAt: new Date((trialEnd + 86_400) * 1000),
    });
  });

  it("converts the first successful payment when a subscription update ends the trial early", async () => {
    const event = paymentEvent({
      billing_reason: "subscription_update",
      created: trialEnd + 2,
      status_transitions: { paid_at: trialEnd + 1 },
    });
    mocks.retrieveInvoice.mockResolvedValue(event.data.object);
    expect(await getStripeTrialConversion(event)).toMatchObject({
      convertedAt: new Date((trialEnd + 1) * 1000),
    });
  });

  it("ignores a paid subscription update raised before the trial ends", async () => {
    mocks.retrieveInvoice.mockResolvedValue(
      paymentEvent({
        billing_reason: "subscription_update",
        created: trialEnd - 1,
      }).data.object,
    );
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it.each([
    "customer.subscription.updated",
    "invoice.paid",
    "invoice.payment_failed",
  ] as const)("does not infer payment from %s", async (type) => {
    const event = paymentEvent();
    event.type = type;
    expect(await getStripeTrialConversion(event)).toBeNull();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
  });

  it.each([
    { amount_paid: 0 },
    { status: "open" },
    { billing_reason: "manual" },
    { parent: null },
    { status_transitions: { paid_at: null } },
  ])("ignores invoices that do not establish paid conversion: %j", async (overrides) => {
    mocks.retrieveInvoice.mockResolvedValue(
      paymentEvent(overrides).data.object,
    );
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it("does not convert a subscription without a trial", async () => {
    mocks.retrieve.mockResolvedValue({ id: "sub_test", trial_end: null });
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it("ignores charges raised during the trial", async () => {
    mocks.retrieveInvoice.mockResolvedValue(
      paymentEvent({ created: trialEnd - 1 }).data.object,
    );
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it("does not report a renewal as conversion when earlier paid history exists", async () => {
    mocks.list.mockReturnValue([
      {
        id: "in_previous",
        parent: { subscription_details: { subscription: "sub_previous" } },
        amount_paid: 1000,
        status_transitions: { paid_at: trialEnd + 1 },
      },
    ]);
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it("allows the first positive payment after a free invoice and ignores later payments", async () => {
    mocks.list.mockReturnValue([
      {
        id: "in_test",
        amount_paid: 1000,
        status_transitions: { paid_at: trialEnd + 10 },
      },
      {
        id: "in_free",
        amount_paid: 0,
        status_transitions: { paid_at: trialEnd },
      },
      {
        id: "in_later",
        parent: { subscription_details: { subscription: "sub_test" } },
        amount_paid: 1000,
        status_transitions: { paid_at: trialEnd + 1000 },
      },
    ]);
    expect(await getStripeTrialConversion(paymentEvent())).not.toBeNull();
  });
});

function paymentEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: "evt_test",
    type: "invoice.payment_succeeded",
    created: trialEnd + 100,
    data: {
      object: {
        id: "in_test",
        customer: "cus_test",
        status: "paid",
        amount_paid: 1000,
        billing_reason: "subscription_cycle",
        created: trialEnd,
        status_transitions: { paid_at: trialEnd + 10 },
        parent: { subscription_details: { subscription: "sub_test" } },
        ...overrides,
      },
    },
  } as Stripe.Event;
}
