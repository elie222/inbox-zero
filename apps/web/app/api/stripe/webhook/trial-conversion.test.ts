import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeTrialConversion } from "./trial-conversion";

vi.mock("@/utils/prisma");

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), list: vi.fn() }));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mocks.retrieve },
    invoices: { list: mocks.list },
  }),
}));

const trialEnd = 1_700_000_000;

describe("getStripeTrialConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retrieve.mockResolvedValue({ id: "sub_test", trial_end: trialEnd });
    mocks.list.mockReturnValue([]);
  });

  it("uses the successful payment time after a failed first attempt", async () => {
    const event = paymentEvent({
      status_transitions: { paid_at: trialEnd + 86_400 },
    });
    expect(await getStripeTrialConversion(event)).toEqual({
      subscription: { id: "sub_test", trial_end: trialEnd },
      invoice: event.data.object,
      convertedAt: new Date((trialEnd + 86_400) * 1000),
    });
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
  });

  it.each([
    { amount_paid: 0 },
    { status: "open" },
    { billing_reason: "subscription_update" },
    { billing_reason: "manual" },
    { parent: null },
    { status_transitions: { paid_at: null } },
  ])("ignores invoices that do not establish paid conversion: %j", async (overrides) => {
    expect(await getStripeTrialConversion(paymentEvent(overrides))).toBeNull();
  });

  it("does not convert a subscription without a trial", async () => {
    mocks.retrieve.mockResolvedValue({ id: "sub_test", trial_end: null });
    expect(await getStripeTrialConversion(paymentEvent())).toBeNull();
  });

  it("ignores charges raised during the trial", async () => {
    expect(
      await getStripeTrialConversion(paymentEvent({ created: trialEnd - 1 })),
    ).toBeNull();
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
