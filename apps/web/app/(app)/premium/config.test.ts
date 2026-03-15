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
  },
}));

import { hasLegacyStripePriceId } from "./config";

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
});
