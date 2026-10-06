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

import {
  consumeUnsubscribeCredit,
  refundUnsubscribeCredit,
  reserveUnsubscribeCredit,
  userHasUnsubscribeAccess,
} from "./unsubscribe-credits";

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

describe("unsubscribe credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
    envMock.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS = 5;
  });

  it("allows premium users and does not spend a credit", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({
        tier: "PRO_MONTHLY",
        stripeSubscriptionStatus: "active",
        unsubscribeCredits: 0,
      }),
    } as never);

    await expect(userHasUnsubscribeAccess({ userId: "user-1" })).resolves.toBe(
      true,
    );
    await expect(reserveUnsubscribeCredit({ userId: "user-1" })).resolves.toBe(
      "premium",
    );

    expect(prisma.premium.updateMany).not.toHaveBeenCalled();
  });

  it("allows a free user with credits and decrements the current period", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium(),
    } as never);
    prisma.premium.updateMany
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);

    await expect(userHasUnsubscribeAccess({ userId: "user-1" })).resolves.toBe(
      true,
    );
    await expect(reserveUnsubscribeCredit({ userId: "user-1" })).resolves.toBe(
      "reserved",
    );

    expect(prisma.premium.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "premium-1",
        unsubscribeMonth: getUnsubscribePeriod(),
        unsubscribeCredits: { gt: 0 },
      },
      data: { unsubscribeCredits: { decrement: 1 } },
    });
  });

  it("does not treat a missed debit as a reservation", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({ unsubscribeCredits: 0 }),
    } as never);
    prisma.premium.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(reserveUnsubscribeCredit({ userId: "user-1" })).resolves.toBe(
      "denied",
    );
  });

  it("resets a stale free allowance before spending one credit", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({
        unsubscribeMonth: 202_001,
        unsubscribeCredits: 0,
      }),
    } as never);
    prisma.premium.updateMany.mockResolvedValue({ count: 1 } as never);

    await expect(userHasUnsubscribeAccess({ userId: "user-1" })).resolves.toBe(
      true,
    );
    await expect(reserveUnsubscribeCredit({ userId: "user-1" })).resolves.toBe(
      "reserved",
    );

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

  it("returns a reserved credit up to the free allowance", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({ unsubscribeCredits: 4 }),
    } as never);

    await refundUnsubscribeCredit({ userId: "user-1" });

    expect(prisma.premium.updateMany).toHaveBeenCalledWith({
      where: {
        id: "premium-1",
        unsubscribeMonth: getUnsubscribePeriod(),
        unsubscribeCredits: { lt: 5 },
      },
      data: { unsubscribeCredits: { increment: 1 } },
    });
  });

  it("spends through the same debit the web action uses", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium(),
    } as never);
    prisma.premium.updateMany
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);

    await consumeUnsubscribeCredit({ userId: "user-1" });

    expect(prisma.premium.updateMany).toHaveBeenCalledTimes(2);
  });

  it("denies a free user who already spent this period's credits", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: freePremium({ unsubscribeCredits: 0 }),
    } as never);

    await expect(userHasUnsubscribeAccess({ userId: "user-1" })).resolves.toBe(
      false,
    );
  });

  it("treats a missing user as having no allowance", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(userHasUnsubscribeAccess({ userId: "user-1" })).resolves.toBe(
      false,
    );
    await expect(
      consumeUnsubscribeCredit({ userId: "user-1" }),
    ).rejects.toBeInstanceOf(SafeError);
  });
});
