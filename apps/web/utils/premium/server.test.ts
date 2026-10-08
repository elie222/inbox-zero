import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ONE_YEAR_MS } from "@/utils/date";
import { applyPendingPremiumGrant } from "./server";

vi.mock("@/utils/prisma");
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));

describe("applyPendingPremiumGrant", () => {
  const now = new Date("2026-10-02T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants premium from sign-up time and consumes the pending grant", async () => {
    prisma.pendingPremiumGrant.findUnique.mockResolvedValue({
      id: "grant-1",
      email: "new.user@example.com",
      tier: "PLUS_ANNUALLY",
      count: 2,
      emailAccountsAccess: 3,
    } as Awaited<ReturnType<typeof prisma.pendingPremiumGrant.findUnique>>);
    prisma.pendingPremiumGrant.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ premiumId: null } as Awaited<
      ReturnType<typeof prisma.user.findUnique>
    >);
    prisma.premium.create.mockResolvedValue({ users: [] } as unknown as Awaited<
      ReturnType<typeof prisma.premium.create>
    >);

    await applyPendingPremiumGrant({
      userId: "user-1",
      email: " New.User@example.com ",
    });

    expect(prisma.pendingPremiumGrant.findUnique).toHaveBeenCalledWith({
      where: { email: "new.user@example.com" },
    });
    expect(prisma.premium.create).toHaveBeenCalledWith({
      data: {
        users: { connect: { id: "user-1" } },
        admins: { connect: { id: "user-1" } },
        adminGrantTier: "PLUS_ANNUALLY",
        adminGrantExpiresAt: new Date(now.getTime() + 2 * ONE_YEAR_MS),
        emailAccountsAccess: 3,
      },
      select: { users: { select: { id: true, email: true } } },
    });
    expect(prisma.pendingPremiumGrant.deleteMany).toHaveBeenCalledWith({
      where: { id: "grant-1" },
    });
  });

  it("does nothing when there is no pending grant", async () => {
    prisma.pendingPremiumGrant.findUnique.mockResolvedValue(null);

    await applyPendingPremiumGrant({
      userId: "user-1",
      email: "user@example.com",
    });

    expect(prisma.premium.create).not.toHaveBeenCalled();
    expect(prisma.premium.update).not.toHaveBeenCalled();
    expect(prisma.pendingPremiumGrant.deleteMany).not.toHaveBeenCalled();
  });

  it("does not grant when another sign-up already claimed the grant", async () => {
    prisma.pendingPremiumGrant.findUnique.mockResolvedValue({
      id: "grant-1",
      email: "new.user@example.com",
      tier: "PLUS_ANNUALLY",
      count: 1,
      emailAccountsAccess: null,
    } as Awaited<ReturnType<typeof prisma.pendingPremiumGrant.findUnique>>);
    prisma.pendingPremiumGrant.deleteMany.mockResolvedValue({ count: 0 });

    await applyPendingPremiumGrant({
      userId: "user-1",
      email: "new.user@example.com",
    });

    expect(prisma.premium.create).not.toHaveBeenCalled();
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });
});
