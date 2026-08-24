import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  connectPurchaserAsAdmin,
  getEffectiveStripeSubscriptionStatus,
} from "./sync-stripe";

vi.mock("@/utils/prisma");

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
      where: { id: "premium-1" },
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

function getStripeWithCustomer(customer: unknown): Stripe {
  return {
    customers: { retrieve: vi.fn().mockResolvedValue(customer) },
  } as unknown as Stripe;
}
