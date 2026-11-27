import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  cancelPremiumLemon,
  extendPremiumLemon,
  upgradeToPremiumLemon,
} from "./server";

vi.mock("@/utils/prisma");
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));

type Row = { renewsAt: Date | null; eventAt: Date | null };

// Minimal in-memory premium row that honours the `lemonSqueezyEventAt` guard.
function mockPremiumRow(row: Row) {
  prisma.premium.update.mockImplementation((async ({ data }: any) => {
    row.renewsAt = data.lemonSqueezyRenewsAt ?? row.renewsAt;
    return { users: [{ email: "user@example.com" }] };
  }) as any);
  prisma.premium.updateMany.mockImplementation((async ({ where, data }: any) => {
    const guard = where.OR as Array<{ lemonSqueezyEventAt: any }> | undefined;
    const allowed =
      !guard ||
      guard.some(({ lemonSqueezyEventAt }) =>
        lemonSqueezyEventAt === null
          ? row.eventAt === null
          : row.eventAt !== null &&
            row.eventAt <= lemonSqueezyEventAt.lte,
      );
    if (!allowed) return { count: 0 };
    row.renewsAt = data.lemonSqueezyRenewsAt;
    row.eventAt = data.lemonSqueezyEventAt;
    return { count: 1 };
  }) as any);
  prisma.premium.findUnique.mockResolvedValue({
    users: [{ email: "user@example.com" }],
  } as any);
}

describe("Lemon Squeezy subscription event ordering", () => {
  const endsAt = new Date("2026-12-01T00:00:00Z");
  const staleRenewsAt = new Date("2027-01-01T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a late subscription_updated that is older than a cancellation", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);

    await cancelPremiumLemon({
      premiumId: "premium-1",
      lemonSqueezyEndsAt: endsAt,
      eventAt: new Date("2026-11-27T10:00:02Z"),
    });
    const result = await extendPremiumLemon({
      premiumId: "premium-1",
      lemonSqueezyRenewsAt: staleRenewsAt,
      eventAt: new Date("2026-11-27T10:00:01Z"),
    });

    expect(result).toBeNull();
    expect(row.renewsAt).toEqual(endsAt);
  });

  it("applies a newer subscription_updated", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);

    await extendPremiumLemon({
      premiumId: "premium-1",
      lemonSqueezyRenewsAt: endsAt,
      eventAt: new Date("2026-11-27T10:00:01Z"),
    });
    const result = await extendPremiumLemon({
      premiumId: "premium-1",
      lemonSqueezyRenewsAt: staleRenewsAt,
      eventAt: new Date("2026-11-27T10:00:02Z"),
    });

    expect(result).not.toBeNull();
    expect(row.renewsAt).toEqual(staleRenewsAt);
  });

  const upgradeOptions = {
    userId: "user-1",
    tier: "PRO_MONTHLY" as any,
    lemonSqueezyRenewsAt: staleRenewsAt,
    lemonSqueezySubscriptionId: 1,
    lemonSqueezySubscriptionItemId: 2,
    lemonSqueezyOrderId: null,
    lemonSqueezyCustomerId: 3,
    lemonSqueezyProductId: 4,
    lemonSqueezyVariantId: 5,
  };

  it("ignores a late subscription_created / plan_changed after a cancellation", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" } as any);

    await cancelPremiumLemon({
      premiumId: "premium-1",
      lemonSqueezyEndsAt: endsAt,
      eventAt: new Date("2026-11-27T10:00:02Z"),
    });
    const result = await upgradeToPremiumLemon({
      ...upgradeOptions,
      eventAt: new Date("2026-11-27T10:00:01Z"),
    });

    expect(result).toBeNull();
    expect(row.renewsAt).toEqual(endsAt);
  });

  it("applies a newer subscription_created and records its event time", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" } as any);

    const result = await upgradeToPremiumLemon({
      ...upgradeOptions,
      eventAt: new Date("2026-11-27T10:00:03Z"),
    });

    expect(result).not.toBeNull();
    expect(row.renewsAt).toEqual(staleRenewsAt);
    expect(row.eventAt).toEqual(new Date("2026-11-27T10:00:03Z"));
  });
});
