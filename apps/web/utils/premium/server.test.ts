import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockUpdateStripeSubscriptionItemQuantity,
  mockUpdateSubscriptionItemQuantity,
} = vi.hoisted(() => ({
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

  it("includes a second email account for the same user on Stripe subscriptions", async () => {
    prisma.premium.findUnique.mockResolvedValue({
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
    expect(mockUpdateSubscriptionItemQuantity).not.toHaveBeenCalled();
  });

  it("keeps each shared premium user at a full seat", async () => {
    prisma.premium.findUnique.mockResolvedValue({
      stripeSubscriptionItemId: "si_123",
      lemonSqueezySubscriptionItemId: null,
      users: [
        { _count: { emailAccounts: 1 } },
        { _count: { emailAccounts: 1 } },
        { _count: { emailAccounts: 1 } },
      ],
    });

    await syncPremiumSeats("premium-1");

    expect(mockUpdateStripeSubscriptionItemQuantity).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionItemId: "si_123",
        quantity: 3,
      }),
    );
  });
});
