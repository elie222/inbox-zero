import { describe, expect, it } from "vitest";

import { getEffectiveStripeSubscriptionStatus } from "./sync-stripe";

describe("getEffectiveStripeSubscriptionStatus", () => {
  it("treats canceled trials as canceled for app access", () => {
    expect(
      getEffectiveStripeSubscriptionStatus({
        status: "trialing",
        cancel_at_period_end: true,
      }),
    ).toBe("canceled");
  });

  it("preserves active subscriptions that cancel at period end", () => {
    expect(
      getEffectiveStripeSubscriptionStatus({
        status: "active",
        cancel_at_period_end: true,
      }),
    ).toBe("active");
  });

  it("preserves active trials that are still running", () => {
    expect(
      getEffectiveStripeSubscriptionStatus({
        status: "trialing",
        cancel_at_period_end: false,
      }),
    ).toBe("trialing");
  });
});
