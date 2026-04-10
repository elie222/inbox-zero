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
  it("includes one personal inbox for the new monthly prices", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_starter_monthly",
        users: [
          {
            emailAccounts: [
              { email: "founder@company.com" },
              { email: "founder@gmail.com" },
            ],
          },
        ],
      }),
    ).toBe(1);
  });

  it("does not discount same-domain work inboxes", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_plus_monthly",
        users: [
          {
            emailAccounts: [
              { email: "founder@company.com" },
              { email: "billing@company.com" },
            ],
          },
        ],
      }),
    ).toBe(2);
  });

  it("counts each shared user separately", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_current_professional_monthly",
        users: [
          {
            emailAccounts: [
              { email: "founder@company.com" },
              { email: "founder@gmail.com" },
            ],
          },
          {
            emailAccounts: [{ email: "teammate@company.com" }],
          },
        ],
      }),
    ).toBe(2);
  });

  it("keeps legacy prices on raw account counts", () => {
    expect(
      getStripeBillingQuantity({
        priceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
        users: [
          {
            emailAccounts: [
              { email: "founder@company.com" },
              { email: "founder@gmail.com" },
            ],
          },
        ],
      }),
    ).toBe(2);
  });
});
