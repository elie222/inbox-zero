import { describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID: 1,
    NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID: 2,
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID: 3,
    NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID: 4,
    NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID: 5,
    NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID: 6,
    NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID: 7,
    NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID: "price_starter_current",
    NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID: "price_starter_annual",
    NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID: "price_plus_current",
    NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID: "price_plus_annual",
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID:
      "price_professional_current",
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID:
      "price_professional_annual",
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

import { getIncludedEmailAccountsPerUserForStripePrice } from "./config";

describe("getIncludedEmailAccountsPerUserForStripePrice", () => {
  it("applies the included-account allowance to active Stripe prices", () => {
    expect(
      getIncludedEmailAccountsPerUserForStripePrice({
        priceId: "price_plus_current",
      }),
    ).toBe(2);
  });

  it("keeps legacy Stripe prices on the default billing quantity", () => {
    expect(
      getIncludedEmailAccountsPerUserForStripePrice({
        priceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
      }),
    ).toBe(1);
  });

  it("defaults unknown prices to the legacy billing quantity", () => {
    expect(
      getIncludedEmailAccountsPerUserForStripePrice({
        priceId: "price_unknown",
      }),
    ).toBe(1);
  });
});
