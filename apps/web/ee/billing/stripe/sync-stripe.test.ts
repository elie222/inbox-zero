import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  connectPurchaserAsAdmin,
  getEffectiveStripeSubscriptionStatus,
  syncStripeDataToDb,
} from "./sync-stripe";

const mocks = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  retrieveCustomer: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/ee/billing/stripe/loops-events", () => ({
  handleLoopsEvents: vi.fn(),
}));
vi.mock("@/utils/premium/seats", () => ({ syncPremiumSeats: vi.fn() }));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));
vi.mock("@/app/(app)/premium/config", () => ({
  getStripeSubscriptionTier: () => "PRO_MONTHLY",
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    subscriptions: { list: mocks.listSubscriptions },
    customers: { retrieve: mocks.retrieveCustomer },
  }),
}));

describe("getEffectiveStripeSubscriptionStatus", () => {
  it("treats canceled trials as canceled for app access", () => {
    expect(
      getEffectiveStripeSubscriptionStatus({
        status: "trialing",
        cancel_at_period_end: true,
      }),
    ).toBe("canceled");
  });

  it("preserves active subscriptions that cancel at period end", () => {
    expect(
      getEffectiveStripeSubscriptionStatus({
        status: "active",
        cancel_at_period_end: true,
      }),
    ).toBe("active");
  });

  it("preserves active trials that are still running", () => {
    expect(
      getEffectiveStripeSubscriptionStatus({
        status: "trialing",
        cancel_at_period_end: false,
      }),
    ).toBe("trialing");
  });
});

describe("connectPurchaserAsAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects the purchaser identified by trusted customer metadata", async () => {
    const result = await connectPurchaserAsAdmin({
      stripe: getStripeWithCustomer({ metadata: { userId: "user-1" } }),
      customerId: "cus_1",
      premium: { id: "premium-1", users: [{ id: "user-1" }, { id: "user-2" }] },
      logger: createTestLogger(),
    });

    expect(result).toBe(true);
    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: {
        id: "premium-1",
        users: { some: { id: "user-1" } },
      },
      data: { admins: { connect: { id: "user-1" } } },
    });
  });

  it("skips when the metadata user is no longer linked to the premium", async () => {
    const result = await connectPurchaserAsAdmin({
      stripe: getStripeWithCustomer({ metadata: { userId: "someone-else" } }),
      customerId: "cus_1",
      premium: { id: "premium-1", users: [{ id: "user-1" }] },
      logger: createTestLogger(),
    });

    expect(result).toBe(false);
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });

  it("skips when the customer carries no metadata userId", async () => {
    const result = await connectPurchaserAsAdmin({
      stripe: getStripeWithCustomer({ metadata: {} }),
      customerId: "cus_1",
      premium: { id: "premium-1", users: [{ id: "user-1" }] },
      logger: createTestLogger(),
    });

    expect(result).toBe(false);
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });

  it("skips deleted Stripe customers", async () => {
    const result = await connectPurchaserAsAdmin({
      stripe: getStripeWithCustomer({ deleted: true }),
      customerId: "cus_1",
      premium: { id: "premium-1", users: [{ id: "user-1" }] },
      logger: createTestLogger(),
    });

    expect(result).toBe(false);
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });
});

describe("syncStripeDataToDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists custom cancellation dates and clears them when cancellation is removed", async () => {
    prisma.premium.findUnique.mockResolvedValue(null);
    prisma.premium.upsert.mockResolvedValue({
      id: "premium-1",
      users: [],
      admins: [],
    });
    const subscription = {
      id: "sub_test",
      status: "active",
      cancel_at_period_end: false,
      cancel_at: 1_800_000_000,
      items: {
        data: [
          { id: "si_test", price: { id: "price_test", product: "prod_test" } },
        ],
      },
    };
    mocks.listSubscriptions.mockResolvedValue({ data: [subscription] });
    await syncStripeDataToDb({
      customerId: "cus_1",
      logger: createTestLogger(),
    });
    expect(prisma.premium.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          stripeCancelAt: new Date(1_800_000_000_000),
          stripeCancelAtPeriodEnd: false,
          stripeSubscriptionStatus: "active",
        }),
      }),
    );
    mocks.listSubscriptions.mockResolvedValue({
      data: [{ ...subscription, cancel_at: null }],
    });
    await syncStripeDataToDb({
      customerId: "cus_1",
      logger: createTestLogger(),
    });
    expect(prisma.premium.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ stripeCancelAt: null }),
      }),
    );
    mocks.listSubscriptions.mockResolvedValue({ data: [] });
    await syncStripeDataToDb({
      customerId: "cus_1",
      logger: createTestLogger(),
    });
    expect(prisma.premium.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ stripeCancelAt: null }),
      }),
    );
  });

  it("repairs the purchaser link when the customer has no subscription", async () => {
    prisma.premium.findUnique.mockResolvedValue({
      stripeSubscriptionStatus: null,
      stripeTrialEnd: null,
      tier: null,
      users: [],
      admins: [],
    });
    mocks.listSubscriptions.mockResolvedValue({ data: [] });
    prisma.premium.upsert.mockResolvedValue({
      id: "premium-1",
      users: [{ id: "user-1" }],
      admins: [],
    });
    mocks.retrieveCustomer.mockResolvedValue({
      metadata: { userId: "user-1" },
    });

    await syncStripeDataToDb({
      customerId: "cus_1",
      logger: createTestLogger(),
    });

    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: {
        id: "premium-1",
        users: { some: { id: "user-1" } },
      },
      data: { admins: { connect: { id: "user-1" } } },
    });
  });
});

function getStripeWithCustomer(customer: unknown): Stripe {
  return {
    customers: { retrieve: vi.fn().mockResolvedValue(customer) },
  } as unknown as Stripe;
}
