import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { getStripeTrialStartedProperties } from "./posthog-events";

describe("getStripeTrialStartedProperties", () => {
  it("returns properties for created trialing subscriptions", () => {
    const event = subscriptionEvent({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_trial",
          status: "trialing",
          trial_end: 1_700_000_000,
        },
      },
    });

    expect(getStripeTrialStartedProperties(event)).toEqual({
      billingProvider: "stripe",
      billingEventId: "evt_test",
      billingEventType: "customer.subscription.created",
      subscriptionId: "sub_trial",
      subscriptionStatus: "trialing",
      trialEnd: "2023-11-14T22:13:20.000Z",
    });
  });

  it("returns properties when an updated subscription enters trialing", () => {
    const event = subscriptionEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_trial",
          status: "trialing",
          trial_end: 1_700_000_000,
        },
        previous_attributes: {
          status: "incomplete",
        },
      },
    });

    expect(getStripeTrialStartedProperties(event)).toEqual(
      expect.objectContaining({
        billingEventType: "customer.subscription.updated",
        subscriptionId: "sub_trial",
      }),
    );
  });

  it("returns null when a subscription update stays trialing", () => {
    const event = subscriptionEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_trial",
          status: "trialing",
          trial_end: 1_700_000_000,
        },
        previous_attributes: {
          status: "trialing",
        },
      },
    });

    expect(getStripeTrialStartedProperties(event)).toBeNull();
  });

  it("returns null for non-trial subscriptions", () => {
    const event = subscriptionEvent({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_active",
          status: "active",
          trial_end: null,
        },
      },
    });

    expect(getStripeTrialStartedProperties(event)).toBeNull();
  });
});

describe("getStripeTrialStartedProperties - subscription.updated guards", () => {
  it("returns null when previousAttributes does not include status (unrelated update)", () => {
    const event = subscriptionEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_trial",
          status: "trialing",
          trial_end: 1_700_000_000,
        },
        previous_attributes: {
          // status not changed in this update
          current_period_end: 1_700_000_000,
        },
      },
    });

    expect(getStripeTrialStartedProperties(event)).toBeNull();
  });
});

function subscriptionEvent(overrides: Partial<Stripe.Event>): Stripe.Event {
  return {
    id: "evt_test",
    type: "customer.subscription.created",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "sub_test",
        status: "incomplete",
        trial_end: null,
      },
      previous_attributes: {},
    },
    ...overrides,
  } as Stripe.Event;
}
