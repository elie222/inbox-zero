import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID: 1,
    NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID: 2,
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID: 3,
    NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID: 4,
    NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID: 5,
    NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID: 6,
    NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID: 7,
    NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID:
      "price_current_starter_monthly",
    NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID:
      "price_current_starter_annual",
    NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID: "price_current_plus_monthly",
    NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID: "price_current_plus_annual",
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID:
      "price_current_professional_monthly",
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID:
      "price_current_professional_annual",
    NEXT_PUBLIC_APPLE_IAP_STARTER_MONTHLY_PRODUCT_ID: "starter.monthly",
    NEXT_PUBLIC_APPLE_IAP_STARTER_ANNUALLY_PRODUCT_ID: "starter.annual",
  },
}));

import {
  getAppleSubscriptionTier,
  getStripePriceId,
  hasLegacyStripePriceId,
  hasIncludedEmailAccountsStripePriceId,
  shouldShowLegacyStripePricingNotice,
} from "./config";

describe("hasLegacyStripePriceId", () => {
  it("returns false when the subscription uses the current Stripe price", () => {
    expect(
      hasLegacyStripePriceId({
        tier: "STARTER_MONTHLY",
        priceId: "price_current_starter_monthly",
      }),
    ).toBe(false);
  });

  it("returns true when the subscription uses a legacy Stripe price", () => {
    expect(
      hasLegacyStripePriceId({
        tier: "STARTER_MONTHLY",
        priceId: "price_1RfeAFKGf8mwZWHnnnPzFEky",
      }),
    ).toBe(true);
  });

  it("returns false when the tier does not have a current Stripe price", () => {
    expect(
      hasLegacyStripePriceId({
        tier: "PRO_MONTHLY",
        priceId: "price_legacy_pro_monthly",
      }),
    ).toBe(false);
  });

  it("derives the tier from the price id when tier is missing", () => {
    expect(
      hasLegacyStripePriceId({
        tier: null,
        priceId: "price_current_starter_monthly",
      }),
    ).toBe(false);

    expect(
      hasLegacyStripePriceId({
        tier: null,
        priceId: "price_1RfeAFKGf8mwZWHnnnPzFEky",
      }),
    ).toBe(true);
  });

  it("returns false for non-current prices that are not configured as legacy", () => {
    expect(
      hasLegacyStripePriceId({
        tier: "STARTER_MONTHLY",
        priceId: "price_unknown_starter_monthly",
      }),
    ).toBe(false);
  });
});

describe("shouldShowLegacyStripePricingNotice", () => {
  it("shows the notice for active legacy Stripe subscriptions", () => {
    expect(
      shouldShowLegacyStripePricingNotice({
        tier: "STARTER_MONTHLY",
        stripePriceId: "price_1RfeAFKGf8mwZWHnnnPzFEky",
        stripeSubscriptionStatus: "active",
      }),
    ).toBe(true);
  });

  it("shows the notice for trialing legacy Stripe subscriptions", () => {
    expect(
      shouldShowLegacyStripePricingNotice({
        tier: "STARTER_MONTHLY",
        stripePriceId: "price_1RfeAFKGf8mwZWHnnnPzFEky",
        stripeSubscriptionStatus: "trialing",
      }),
    ).toBe(true);
  });

  it("hides the notice for non-active Stripe subscriptions", () => {
    expect(
      shouldShowLegacyStripePricingNotice({
        tier: "STARTER_MONTHLY",
        stripePriceId: "price_1RfeAFKGf8mwZWHnnnPzFEky",
        stripeSubscriptionStatus: "canceled",
      }),
    ).toBe(false);
  });

  it("hides the notice when the Stripe price is current", () => {
    expect(
      shouldShowLegacyStripePricingNotice({
        tier: "STARTER_MONTHLY",
        stripePriceId: "price_current_starter_monthly",
        stripeSubscriptionStatus: "active",
      }),
    ).toBe(false);
  });
});

describe("monthly pricing config", () => {
  it("uses the active monthly Stripe price ids for checkout", () => {
    expect(getStripePriceId({ tier: "STARTER_MONTHLY" })).toBe(
      "price_current_starter_monthly",
    );
    expect(getStripePriceId({ tier: "PLUS_MONTHLY" })).toBe(
      "price_current_plus_monthly",
    );
    expect(getStripePriceId({ tier: "PROFESSIONAL_MONTHLY" })).toBe(
      "price_current_professional_monthly",
    );
  });

  it("marks only the active monthly prices for special seat billing", () => {
    expect(
      hasIncludedEmailAccountsStripePriceId("price_current_starter_monthly"),
    ).toBe(false);
    expect(
      hasIncludedEmailAccountsStripePriceId("price_current_plus_monthly"),
    ).toBe(true);
    expect(
      hasIncludedEmailAccountsStripePriceId(
        "price_current_professional_monthly",
      ),
    ).toBe(true);
    expect(
      hasIncludedEmailAccountsStripePriceId("price_current_starter_annual"),
    ).toBe(false);
    expect(
      hasIncludedEmailAccountsStripePriceId("price_1S5u6NKGf8mwZWHnZCfy4D5n"),
    ).toBe(false);
  });
});

describe("getAppleSubscriptionTier", () => {
  it("maps configured starter Apple product ids", () => {
    expect(getAppleSubscriptionTier({ productId: "starter.monthly" })).toBe(
      "STARTER_MONTHLY",
    );
    expect(getAppleSubscriptionTier({ productId: "starter.annual" })).toBe(
      "STARTER_ANNUALLY",
    );
  });

  it("returns null for unknown Apple products", () => {
    expect(getAppleSubscriptionTier({ productId: "unknown.apple.plan" })).toBe(
      null,
    );
  });
});
