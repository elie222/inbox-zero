import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { adminSyncStripeForUserAction } from "./admin";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "admin-user", email: "admin@example.com" },
  })),
}));
vi.mock("@/utils/admin", () => ({
  isAdmin: vi.fn(() => true),
}));
vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: vi.fn(),
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: vi.fn(),
}));
vi.mock("@/utils/user/delete", () => ({
  deleteUser: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/webhook/process-history", () => ({
  processProviderHistory: vi.fn(),
}));
vi.mock("@/utils/hash", () => ({
  hash: vi.fn((value: string) => `hashed:${value}`),
}));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));
vi.mock("@/utils/ai/draft-cleanup", () => ({
  cleanupAIDraftsForAccount: vi.fn(),
  getConfiguredDraftCleanupDays: vi.fn(),
}));
vi.mock("@/app/api/user/stats/response-time/controller", () => ({
  getAdminResponseTimeProviderDelayMs: vi.fn(),
  getResponseTimeStats: vi.fn(),
}));

describe("adminSyncStripeForUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs Stripe for a user found by account email and returns the refreshed premium state", async () => {
    const renewsAt = new Date("2026-06-01T00:00:00.000Z");
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.emailAccount.findUnique.mockResolvedValueOnce({
      user: {
        id: "user-1",
        premium: {
          id: "premium-1",
          stripeCustomerId: "cus_123",
        },
      },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    prisma.premium.findUnique.mockResolvedValueOnce({
      stripeSubscriptionStatus: "active",
      stripeRenewsAt: renewsAt,
      tier: "PRO_MONTHLY",
    } as Awaited<ReturnType<typeof prisma.premium.findUnique>>);

    const result = await adminSyncStripeForUserAction({
      email: " AccountOwner@Example.com ",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "accountowner@example.com" },
      select: {
        id: true,
        premium: {
          select: {
            id: true,
            stripeCustomerId: true,
          },
        },
      },
    });
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
      where: { email: "accountowner@example.com" },
      select: {
        user: {
          select: {
            id: true,
            premium: {
              select: {
                id: true,
                stripeCustomerId: true,
              },
            },
          },
        },
      },
    });
    expect(syncStripeDataToDb).toHaveBeenCalledWith({
      customerId: "cus_123",
      logger: expect.anything(),
    });
    expect(prisma.premium.findUnique).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      select: {
        stripeSubscriptionStatus: true,
        stripeRenewsAt: true,
        tier: true,
      },
    });
    expect(result?.data).toEqual({
      stripeSubscriptionStatus: "active",
      stripeRenewsAt: renewsAt,
      tier: "PRO_MONTHLY",
    });
  });

  it("does not call Stripe when the premium record has no Stripe customer", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      premium: {
        id: "premium-1",
        stripeCustomerId: null,
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await adminSyncStripeForUserAction({
      email: "user@example.com",
    });

    expect(result?.serverError).toBe("Stripe customer ID not found");
    expect(syncStripeDataToDb).not.toHaveBeenCalled();
    expect(prisma.premium.findUnique).not.toHaveBeenCalled();
  });
});
