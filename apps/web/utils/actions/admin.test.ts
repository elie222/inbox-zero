import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  adminGetUserInfoAction,
  adminRemoveUserFromPremiumAction,
} from "@/utils/actions/admin";
import { removeUserFromPremium } from "@/utils/premium/server";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/admin", () => ({
  isAdmin: vi.fn(() => true),
}));
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "admin-user", email: "admin@example.com" },
  })),
}));
vi.mock("@/utils/user/delete", () => ({
  deleteUser: vi.fn(),
}));
vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: vi.fn(),
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/hash", () => ({
  hash: vi.fn((value: string) => `hashed:${value}`),
}));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));
vi.mock("@/utils/ai/draft-cleanup", () => ({
  cleanupAIDraftsForAccount: vi.fn(),
}));
vi.mock("@/utils/premium/server", () => ({
  removeUserFromPremium: vi.fn(),
}));

describe("adminGetUserInfoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns premium membership details with nested users and accounts", async () => {
    const createdAt = new Date("2026-01-01T08:00:00.000Z");
    const lastLogin = new Date("2026-03-01T09:30:00.000Z");
    const watchExpirationDate = new Date("2026-03-20T12:00:00.000Z");
    const renewsAt = new Date("2026-04-01T00:00:00.000Z");
    const lastExecutedRuleAt = new Date("2026-03-05T16:15:00.000Z");

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      createdAt,
      lastLogin,
      premium: {
        id: "premium-1",
        tier: "PROFESSIONAL_MONTHLY",
        emailAccountsAccess: 6,
        lemonSqueezyRenewsAt: null,
        stripeRenewsAt: renewsAt,
        stripeSubscriptionStatus: "active",
        lemonSubscriptionStatus: null,
        pendingInvites: ["invite@example.com"],
        admins: [
          {
            id: "user-1",
            email: "owner@example.com",
            name: "Owner User",
          },
        ],
        users: [
          {
            id: "user-1",
            email: "owner@example.com",
            name: "Owner User",
            emailAccounts: [
              {
                id: "ea-1",
                email: "owner@example.com",
                account: {
                  provider: "google",
                  disconnectedAt: null,
                },
              },
            ],
            _count: {
              emailAccounts: 1,
            },
          },
          {
            id: "user-2",
            email: "member@example.com",
            name: "Member User",
            emailAccounts: [
              {
                id: "ea-2",
                email: "member@example.com",
                account: {
                  provider: "microsoft",
                  disconnectedAt: null,
                },
              },
              {
                id: "ea-3",
                email: "member+ops@example.com",
                account: {
                  provider: "google",
                  disconnectedAt: new Date("2026-02-15T00:00:00.000Z"),
                },
              },
            ],
            _count: {
              emailAccounts: 2,
            },
          },
        ],
      },
      emailAccounts: [
        {
          id: "ea-1",
          email: "owner@example.com",
          createdAt,
          watchEmailsExpirationDate: watchExpirationDate,
          account: {
            provider: "google",
            disconnectedAt: null,
          },
          _count: {
            rules: 3,
          },
        },
      ],
      _count: {
        emailAccounts: 1,
      },
    } as any);
    prisma.executedRule.groupBy.mockResolvedValue([
      {
        emailAccountId: "ea-1",
        _max: {
          createdAt: lastExecutedRuleAt,
        },
      },
    ] as any);

    const result = await adminGetUserInfoAction({
      email: "owner@example.com",
    });

    expect(result?.data).toMatchObject({
      id: "user-1",
      emailAccountCount: 1,
      premium: {
        id: "premium-1",
        tier: "PROFESSIONAL_MONTHLY",
        emailAccountsAccess: 6,
        seatsUsed: 3,
        subscriptionStatus: "active",
        pendingInvites: ["invite@example.com"],
        admins: [
          {
            id: "user-1",
            email: "owner@example.com",
            name: "Owner User",
          },
        ],
        users: [
          {
            id: "user-2",
            email: "member@example.com",
            isAdmin: false,
            emailAccountCount: 2,
            emailAccounts: [
              {
                id: "ea-2",
                email: "member@example.com",
                provider: "microsoft",
                disconnected: false,
              },
              {
                id: "ea-3",
                email: "member+ops@example.com",
                provider: "google",
                disconnected: true,
              },
            ],
          },
          {
            id: "user-1",
            email: "owner@example.com",
            isAdmin: true,
            emailAccountCount: 1,
            emailAccounts: [
              {
                id: "ea-1",
                email: "owner@example.com",
                provider: "google",
                disconnected: false,
              },
            ],
          },
        ],
      },
      emailAccounts: [
        {
          email: "owner@example.com",
          provider: "google",
          disconnected: false,
          ruleCount: 3,
          lastExecutedRuleAt,
          watchExpirationDate,
        },
      ],
    });
  });

  it("falls back to a premium the user manages as an admin", async () => {
    const createdAt = new Date("2026-01-01T08:00:00.000Z");

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      createdAt,
      lastLogin: null,
      premium: null,
      premiumAdmin: {
        id: "premium-2",
        tier: "STARTER_MONTHLY",
        emailAccountsAccess: 2,
        lemonSqueezyRenewsAt: null,
        stripeRenewsAt: new Date("2026-04-10T00:00:00.000Z"),
        stripeSubscriptionStatus: "active",
        lemonSubscriptionStatus: null,
        pendingInvites: [],
        admins: [
          {
            id: "user-1",
            email: "owner@example.com",
            name: "Owner User",
          },
        ],
        users: [
          {
            id: "user-2",
            email: "member@example.com",
            name: "Member User",
            emailAccounts: [
              {
                id: "ea-2",
                email: "member@example.com",
                account: {
                  provider: "google",
                  disconnectedAt: null,
                },
              },
            ],
            _count: {
              emailAccounts: 1,
            },
          },
        ],
      },
      emailAccounts: [
        {
          id: "ea-1",
          email: "owner@example.com",
          createdAt,
          watchEmailsExpirationDate: null,
          account: {
            provider: "google",
            disconnectedAt: null,
          },
          _count: {
            rules: 0,
          },
        },
      ],
      _count: {
        emailAccounts: 1,
      },
    } as any);
    prisma.executedRule.groupBy.mockResolvedValue([]);

    const result = await adminGetUserInfoAction({
      email: "owner@example.com",
    });

    expect(result?.data?.premium).toMatchObject({
      id: "premium-2",
      tier: "STARTER_MONTHLY",
      emailAccountsAccess: 2,
      seatsUsed: 1,
      users: [
        {
          id: "user-2",
          email: "member@example.com",
        },
      ],
    });
  });
});

describe("adminRemoveUserFromPremiumAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes a user from a shared premium", async () => {
    prisma.premium.findUnique.mockResolvedValue({
      users: [
        {
          id: "user-1",
          email: "owner@example.com",
          _count: {
            emailAccounts: 1,
          },
        },
        {
          id: "user-2",
          email: "member@example.com",
          _count: {
            emailAccounts: 2,
          },
        },
      ],
    } as any);

    const result = await adminRemoveUserFromPremiumAction({
      premiumId: "premium-1",
      userId: "user-2",
    });

    expect(removeUserFromPremium).toHaveBeenCalledWith({
      premiumId: "premium-1",
      visitorId: "user-2",
    });
    expect(result?.data).toEqual({
      premiumId: "premium-1",
      removedUserId: "user-2",
      removedUserEmail: "member@example.com",
      seatsFreed: 2,
    });
  });

  it("prevents removing the last user from a premium", async () => {
    prisma.premium.findUnique.mockResolvedValue({
      users: [
        {
          id: "user-2",
          email: "member@example.com",
          _count: {
            emailAccounts: 2,
          },
        },
      ],
    } as any);

    const result = await adminRemoveUserFromPremiumAction({
      premiumId: "premium-1",
      userId: "user-2",
    });

    expect(result?.serverError).toBe(
      "Cannot remove the last user from a premium",
    );
    expect(removeUserFromPremium).not.toHaveBeenCalled();
  });

  it("rejects removal when the user is not attached to the premium", async () => {
    prisma.premium.findUnique.mockResolvedValue({
      users: [
        {
          id: "user-1",
          email: "owner@example.com",
          _count: {
            emailAccounts: 1,
          },
        },
      ],
    } as any);

    const result = await adminRemoveUserFromPremiumAction({
      premiumId: "premium-1",
      userId: "user-2",
    });

    expect(result?.serverError).toBe("User is not on this premium");
    expect(removeUserFromPremium).not.toHaveBeenCalled();
  });
});
