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
      "price_1S5u73KGf8mwZWHn8VYFdALA",
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
  getAddAccountBillingText,
  getStripePerPersonAmount,
  getStripeSeatModel,
  formatPrice,
  shouldShowLegacyStripePricingNotice,
} from "./config";

describe("hasLegacyStripePriceId", () => {
  it("returns false when the current Stripe price also appears in legacy ids", () => {
    expect(
      hasLegacyStripePriceId({
        tier: "STARTER_MONTHLY",
        priceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
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
        priceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
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

  it("hides the notice when the current Stripe price also appears in legacy ids", () => {
    expect(
      shouldShowLegacyStripePricingNotice({
        tier: "STARTER_MONTHLY",
        stripePriceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
        stripeSubscriptionStatus: "active",
      }),
    ).toBe(false);
  });
});

describe("monthly pricing config", () => {
  it("uses the active monthly Stripe price ids for checkout", () => {
    expect(getStripePriceId({ tier: "STARTER_MONTHLY" })).toBe(
      "price_1S5u73KGf8mwZWHn8VYFdALA",
    );
    expect(getStripePriceId({ tier: "PLUS_MONTHLY" })).toBe(
      "price_current_plus_monthly",
    );
    expect(getStripePriceId({ tier: "PROFESSIONAL_MONTHLY" })).toBe(
      "price_current_professional_monthly",
    );
  });

  it("bills current plan prices per person", () => {
    for (const priceId of [
      "price_current_starter_annual",
      "price_current_plus_monthly",
      "price_current_plus_annual",
      "price_current_professional_monthly",
      "price_current_professional_annual",
    ]) {
      expect(getStripeSeatModel(priceId)).toBe("per_person");
    }
  });

  it("keeps grandfathered prices on their old seat billing", () => {
    expect(getStripeSeatModel("price_1SzNImKGf8mwZWHnlYWXLNC4")).toBe(
      "legacy_included",
    );
    expect(getStripeSeatModel("price_1S5u6NKGf8mwZWHnZCfy4D5n")).toBe(
      "legacy_included",
    );
    expect(getStripeSeatModel("price_1SzNJEKGf8mwZWHndmH3lYxf")).toBe(
      "legacy_included",
    );
    // Still the configured Starter price in this env, but a legacy one.
    expect(getStripeSeatModel("price_1S5u73KGf8mwZWHn8VYFdALA")).toBe(
      "per_account",
    );
    expect(getStripeSeatModel("price_1RfeDLKGf8mwZWHn6UW8wJcY")).toBe(
      "per_account",
    );
  });
});

describe("getStripePerPersonAmount", () => {
  it("bills extra accounts at half the annual plan price", () => {
    expect(
      getStripePerPersonAmount({
        priceId: "price_current_professional_annual",
        quantity: 3,
      }),
    ).toBe(72_000);
  });
});

describe("formatPrice", () => {
  it("rounds monthly equivalents of annual prices to whole dollars", () => {
    expect(formatPrice(500 / 12)).toBe("$42");
    expect(formatPrice(250 / 12)).toBe("$21");
  });

  it("keeps cents on exact prices", () => {
    expect(formatPrice(12.5)).toBe("$12.50");
    expect(formatPrice(25)).toBe("$25");
  });
});

describe("getAddAccountBillingText", () => {
  it("quotes the extra account price on current plans", () => {
    expect(
      getAddAccountBillingText({
        tier: "PLUS_MONTHLY",
        stripePriceId: "price_current_plus_monthly",
      }),
    ).toBe(
      "Your plan includes 2 email accounts. Each extra account is $17.50/mo.",
    );
    expect(
      getAddAccountBillingText({
        tier: "STARTER_ANNUALLY",
        stripePriceId: "price_current_starter_annual",
      }),
    ).toBe(
      "Your plan includes 2 email accounts. Each extra account is $10/mo, billed annually.",
    );
  });

  it("does not promise included accounts on per-account legacy plans", () => {
    expect(
      getAddAccountBillingText({
        tier: "STARTER_MONTHLY",
        stripePriceId: "price_1S5u73KGf8mwZWHn8VYFdALA",
      }),
    ).toBe("You will be billed for each account.");
  });

  it("explains included accounts on grandfathered included-account plans", () => {
    expect(
      getAddAccountBillingText({
        tier: "PLUS_MONTHLY",
        stripePriceId: "price_1SzNImKGf8mwZWHnlYWXLNC4",
      }),
    ).toBe(
      "Your plan includes 2 email accounts. Each extra account is billed at your plan's per-account price.",
    );
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

  it("maps the native App Store starter products to the Starter tier", () => {
    expect(
      getAppleSubscriptionTier({
        productId: "com.getinboxzero.starter.monthly.v2",
      }),
    ).toBe("STARTER_MONTHLY");
    expect(
      getAppleSubscriptionTier({
        productId: "com.getinboxzero.starter.annual.v2",
      }),
    ).toBe("STARTER_ANNUALLY");
  });

  it("returns null for unknown Apple products", () => {
    expect(getAppleSubscriptionTier({ productId: "unknown.apple.plan" })).toBe(
      null,
    );
  });
});
