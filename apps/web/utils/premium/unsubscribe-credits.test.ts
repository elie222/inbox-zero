import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { SafeError } from "@/utils/error";
import { getUnsubscribePeriod } from "@/utils/premium";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
    NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS: 5,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));
vi.mock("@/utils/prisma");

import { consumeUnsubscribeCredit } from "./unsubscribe-credits";

function freePremium(overrides: Record<string, unknown> = {}) {
  return {
    id: "premium-1",
    unsubscribeCredits: 2,
    unsubscribeMonth: getUnsubscribePeriod(),
    tier: null,
    adminGrantTier: null,
    adminGrantExpiresAt: null,
    appleExpiresAt: null,
    appleRevokedAt: null,
    appleSubscriptionStatus: null,
    lemonSqueezyRenewsAt: null,
    stripeSubscriptionStatus: null,
    ...overrides,
  };
}

describe("consumeUnsubscribeCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
    envMock.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS = 5;
  });

  it("does not spend a credit for a premium user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({
        tier: "PRO_MONTHLY",
        stripeSubscriptionStatus: "active",
        unsubscribeCredits: 0,
      }),
    } as never);

    await consumeUnsubscribeCredit({ userId: "user-1" });

    expect(prisma.premium.updateMany).not.toHaveBeenCalled();
  });

  it("decrements the current period for a free user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium(),
    } as never);
    prisma.premium.updateMany
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);

    await consumeUnsubscribeCredit({ userId: "user-1" });

    expect(prisma.premium.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "premium-1",
        unsubscribeMonth: getUnsubscribePeriod(),
        unsubscribeCredits: { gt: 0 },
      },
      data: { unsubscribeCredits: { decrement: 1 } },
    });
  });

  it("resets a stale free allowance before spending one credit", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({
        unsubscribeMonth: 202_001,
        unsubscribeCredits: 0,
      }),
    } as never);
    prisma.premium.updateMany.mockResolvedValue({ count: 1 } as never);

    await consumeUnsubscribeCredit({ userId: "user-1" });

    expect(prisma.premium.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.premium.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          unsubscribeCredits: 4,
          unsubscribeMonth: getUnsubscribePeriod(),
        },
      }),
    );
  });

  it("throws when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      consumeUnsubscribeCredit({ userId: "user-1" }),
    ).rejects.toBeInstanceOf(SafeError);
  });
});
