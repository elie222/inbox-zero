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

vi.mock("@/utils/prisma", () => ({
  default: {},
}));

vi.mock("@/ee/billing/lemon/index", () => ({
  updateSubscriptionItemQuantity: vi.fn(),
}));

vi.mock("@/ee/billing/stripe/index", () => ({
  updateStripeSubscriptionItemQuantity: vi.fn(),
}));

import { getStripeBillingQuantity } from "./seats";

describe("getStripeBillingQuantity", () => {
  it("bills one person by their account count on current prices", () => {
    // Current prices are graduated: the first 2 units are one flat price, so
    // 1 or 2 accounts cost the same and each extra account adds half.
    expect(quantity("price_current_starter_monthly", [1])).toBe(1);
    expect(quantity("price_current_starter_monthly", [2])).toBe(2);
    expect(quantity("price_current_plus_annual", [3])).toBe(3);
  });

  it("bills each extra person in full on current prices", () => {
    expect(quantity("price_current_professional_monthly", [2, 1])).toBe(4);
    expect(quantity("price_current_starter_annual", [1, 1, 4])).toBe(8);
  });

  it("ignores team members with no email accounts on current prices", () => {
    expect(quantity("price_current_starter_monthly", [3, 0])).toBe(3);
  });

  it("keeps grandfathered included-account prices on accounts minus one", () => {
    for (const priceId of [
      "price_1SzNImKGf8mwZWHnlYWXLNC4",
      "price_1SzNJEKGf8mwZWHndmH3lYxf",
      "price_1S5u6NKGf8mwZWHnZCfy4D5n",
    ]) {
      expect(quantity(priceId, [2])).toBe(1);
      expect(quantity(priceId, [3])).toBe(2);
      expect(quantity(priceId, [2, 1])).toBe(2);
    }
  });

  it("keeps other grandfathered prices on raw account counts", () => {
    expect(quantity("price_1S5u73KGf8mwZWHn8VYFdALA", [2])).toBe(2);
    expect(quantity("price_1S5u73KGf8mwZWHn8VYFdALA", [2, 1])).toBe(3);
    expect(quantity("price_1S5u6uKGf8mwZWHnEvPWuQzG", [2])).toBe(2);
  });

  it("never bills less than one unit", () => {
    expect(quantity("price_current_starter_monthly", [])).toBe(1);
    expect(quantity("price_1S5u73KGf8mwZWHn8VYFdALA", [0])).toBe(1);
  });
});

function quantity(priceId: string, accountCounts: number[]) {
  return getStripeBillingQuantity({
    priceId,
    users: accountCounts.map((emailAccounts) => ({
      _count: { emailAccounts },
    })),
  });
}
