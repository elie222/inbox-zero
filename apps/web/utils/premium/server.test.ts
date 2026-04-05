import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockGetIncludedEmailAccountsPerUserForStripePrice,
  mockUpdateStripeSubscriptionItemQuantity,
  mockUpdateSubscriptionItemQuantity,
} = vi.hoisted(() => ({
  mockGetIncludedEmailAccountsPerUserForStripePrice: vi.fn(),
  mockUpdateStripeSubscriptionItemQuantity: vi.fn(),
  mockUpdateSubscriptionItemQuantity: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@/app/(app)/premium/config", () => ({
  getIncludedEmailAccountsPerUserForStripePrice:
    mockGetIncludedEmailAccountsPerUserForStripePrice,
}));

vi.mock("@/ee/billing/stripe/index", () => ({
  updateStripeSubscriptionItemQuantity:
    mockUpdateStripeSubscriptionItemQuantity,
}));

vi.mock("@/ee/billing/lemon/index", () => ({
  updateSubscriptionItemQuantity: mockUpdateSubscriptionItemQuantity,
}));

vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));

import { syncPremiumSeats } from "./server";

describe("syncPremiumSeats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses plan-configured included accounts for active Stripe prices", async () => {
    mockGetIncludedEmailAccountsPerUserForStripePrice.mockReturnValue(2);
    prisma.premium.findUnique.mockResolvedValue({
      stripePriceId: "price_current",
      stripeSubscriptionItemId: "si_123",
      lemonSqueezySubscriptionItemId: null,
      users: [{ _count: { emailAccounts: 2 } }],
    });

    await syncPremiumSeats("premium-1");

    expect(mockUpdateStripeSubscriptionItemQuantity).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionItemId: "si_123",
        quantity: 1,
      }),
    );
    expect(
      mockGetIncludedEmailAccountsPerUserForStripePrice,
    ).toHaveBeenCalledWith({
      priceId: "price_current",
    });
    expect(mockUpdateSubscriptionItemQuantity).not.toHaveBeenCalled();
  });

  it("keeps legacy quantities for subscriptions without a Stripe price config", async () => {
    prisma.premium.findUnique.mockResolvedValue({
      stripePriceId: null,
      stripeSubscriptionItemId: "si_123",
      lemonSqueezySubscriptionItemId: null,
      users: [{ _count: { emailAccounts: 2 } }],
    });

    await syncPremiumSeats("premium-1");

    expect(mockUpdateStripeSubscriptionItemQuantity).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionItemId: "si_123",
        quantity: 2,
      }),
    );
    expect(
      mockGetIncludedEmailAccountsPerUserForStripePrice,
    ).not.toHaveBeenCalled();
  });
});
