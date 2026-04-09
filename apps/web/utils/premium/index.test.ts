import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

import { getUserTier, hasActiveAppleSubscription, isPremium } from "./index";

describe("Apple premium helpers", () => {
  it("treats grace and retry states as active", () => {
    const expiredDate = new Date(Date.now() - 60_000).toISOString();

    expect(
      hasActiveAppleSubscription(expiredDate, null, "BILLING_GRACE_PERIOD"),
    ).toBe(true);
    expect(hasActiveAppleSubscription(expiredDate, null, "BILLING_RETRY")).toBe(
      true,
    );
  });

  it("treats active Apple subscriptions as premium even when the expiry is past", () => {
    const expiredDate = new Date(Date.now() - 60_000).toISOString();

    expect(isPremium(null, null, expiredDate, null, "ACTIVE")).toBe(true);
  });

  it("preserves the tier for active Apple subscriptions", () => {
    const expiredDate = new Date(Date.now() - 60_000).toISOString();

    expect(
      getUserTier({
        tier: "STARTER_MONTHLY",
        appleExpiresAt: expiredDate,
        appleRevokedAt: null,
        appleSubscriptionStatus: "ACTIVE",
        lemonSqueezyRenewsAt: null,
        stripeSubscriptionStatus: null,
      }),
    ).toBe("STARTER_MONTHLY");
  });
});
