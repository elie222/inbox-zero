import { afterEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import {
  getPremiumUserFilter,
  getUserTier,
  hasActiveAppleSubscription,
  isPremium,
  isPremiumRecord,
} from "./index";

describe("Apple premium helpers", () => {
  afterEach(() => {
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
  });

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

  it("treats active Apple premium records as premium even when the expiry is past", () => {
    const expiredDate = new Date(Date.now() - 60_000).toISOString();

    expect(
      isPremiumRecord({
        appleExpiresAt: expiredDate,
        appleRevokedAt: null,
        appleSubscriptionStatus: "ACTIVE",
        lemonSqueezyRenewsAt: null,
        stripeSubscriptionStatus: null,
      }),
    ).toBe(true);
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

  it("treats missing premium records as premium when bypass checks are enabled", () => {
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = true;

    expect(isPremiumRecord(null)).toBe(true);
  });
});

describe("digest access", () => {
  afterEach(() => {
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
  });

  it("filters premium users by minimum tier when requested", () => {
    const filter = getPremiumUserFilter({ minimumTier: "PLUS_MONTHLY" });

    expect(filter.user.premium.tier).toEqual({
      in: [
        "PLUS_MONTHLY",
        "PLUS_ANNUALLY",
        "PROFESSIONAL_MONTHLY",
        "PROFESSIONAL_ANNUALLY",
        "COPILOT_MONTHLY",
        "LIFETIME",
      ],
    });
  });
});
