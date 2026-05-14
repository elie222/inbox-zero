import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { adminSyncStripeForUserAction } from "./admin";

const { mockAuth, mockSyncStripeDataToDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSyncStripeDataToDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: mockAuth,
}));
vi.mock("@/env", () => ({
  env: {
    ADMINS: ["admin@example.com"],
    NODE_ENV: "test",
  },
}));
vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: mockSyncStripeDataToDb,
}));

describe("adminSyncStripeForUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-user", email: "admin@example.com" },
    });
    mockSyncStripeDataToDb.mockResolvedValue(undefined);
  });

  it("normalizes user email, syncs the stored customer, and returns refreshed premium state", async () => {
    const renewsAt = new Date("2026-05-20T12:00:00Z");
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_123",
      },
    } as any);
    prisma.premium.findUnique.mockResolvedValue({
      stripeSubscriptionStatus: "active",
      stripeRenewsAt: renewsAt,
      tier: "business",
    } as any);

    const result = await adminSyncStripeForUserAction({
      email: "USER@EXAMPLE.COM ",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
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
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
    expect(mockSyncStripeDataToDb).toHaveBeenCalledWith({
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
      tier: "business",
    });
  });

  it("falls back to the owner of a matching email account", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.emailAccount.findUnique.mockResolvedValue({
      user: {
        id: "user-2",
        premium: {
          id: "premium-2",
          stripeCustomerId: "cus_email_account",
        },
      },
    } as any);
    prisma.premium.findUnique.mockResolvedValue({
      stripeSubscriptionStatus: "trialing",
      stripeRenewsAt: null,
      tier: "basic",
    } as any);

    const result = await adminSyncStripeForUserAction({
      email: "alias@example.com",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
      where: { email: "alias@example.com" },
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
    expect(mockSyncStripeDataToDb).toHaveBeenCalledWith({
      customerId: "cus_email_account",
      logger: expect.anything(),
    });
  });

  it("rejects users without a premium record before syncing Stripe", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      premium: null,
    } as any);

    const result = await adminSyncStripeForUserAction({
      email: "user@example.com",
    });

    expect(result?.serverError).toBe("Premium record not found");
    expect(mockSyncStripeDataToDb).not.toHaveBeenCalled();
    expect(prisma.premium.findUnique).not.toHaveBeenCalled();
  });

  it("rejects premium records without a Stripe customer before syncing Stripe", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      premium: {
        id: "premium-1",
        stripeCustomerId: null,
      },
    } as any);

    const result = await adminSyncStripeForUserAction({
      email: "user@example.com",
    });

    expect(result?.serverError).toBe("Stripe customer ID not found");
    expect(mockSyncStripeDataToDb).not.toHaveBeenCalled();
    expect(prisma.premium.findUnique).not.toHaveBeenCalled();
  });

  it("requires an admin session", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "regular-user", email: "regular@example.com" },
    });

    const result = await adminSyncStripeForUserAction({
      email: "user@example.com",
    });

    expect(result?.serverError).toBe("Unauthorized");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockSyncStripeDataToDb).not.toHaveBeenCalled();
  });
});
