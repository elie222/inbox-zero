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

import { getStripeBillingQuantity } from "./billing";

describe("getStripeBillingQuantity", () => {
  it("includes one extra email account per user on included-email prices", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_starter_monthly",
        users: [{ _count: { emailAccounts: 2 } }],
      }),
    ).toBe(1);
  });

  it("includes one extra email regardless of domain", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_plus_monthly",
        users: [{ _count: { emailAccounts: 2 } }],
      }),
    ).toBe(1);
  });

  it("bills additional accounts beyond the included one", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_starter_monthly",
        users: [{ _count: { emailAccounts: 3 } }],
      }),
    ).toBe(2);
  });

  it("applies the discount per user, not per team", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_professional_monthly",
        users: [
          { _count: { emailAccounts: 2 } },
          { _count: { emailAccounts: 1 } },
        ],
      }),
    ).toBe(2);
  });

  it("keeps legacy prices on raw account counts", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
        users: [{ _count: { emailAccounts: 2 } }],
      }),
    ).toBe(2);
  });

  it("returns at least 1 even with no accounts", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_starter_monthly",
        users: [{ _count: { emailAccounts: 0 } }],
      }),
    ).toBe(1);
  });
});
