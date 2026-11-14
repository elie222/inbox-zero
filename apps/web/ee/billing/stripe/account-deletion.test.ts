import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { cancelStripeSubscriptionForDeletedUser } from "./account-deletion";

const { mockRetrieve, mockCancel } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockCancel: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mockRetrieve, cancel: mockCancel },
  }),
}));

const logger = createTestLogger();

describe("cancelStripeSubscriptionForDeletedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels the subscription of a plan's only member", async () => {
    mockPremium({ users: 1 });
    mockRetrieve.mockResolvedValue({ id: "sub_123", status: "active" });

    await cancelStripeSubscriptionForDeletedUser({ userId: "user-1", logger });

    expect(mockCancel).toHaveBeenCalledWith("sub_123", undefined, {
      idempotencyKey: "account-deletion-cancel-sub_123",
    });
  });

  it("keeps a plan that other members still use", async () => {
    mockPremium({ users: 2 });

    await cancelStripeSubscriptionForDeletedUser({ userId: "user-1", logger });

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("skips a subscription that has already ended", async () => {
    mockPremium({ users: 1 });
    mockRetrieve.mockResolvedValue({ id: "sub_123", status: "canceled" });

    await cancelStripeSubscriptionForDeletedUser({ userId: "user-1", logger });

    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("does nothing without a Stripe subscription", async () => {
    prisma.user.findUnique.mockResolvedValue({ premium: null } as any);

    await cancelStripeSubscriptionForDeletedUser({ userId: "user-1", logger });

    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});

function mockPremium({ users }: { users: number }) {
  prisma.user.findUnique.mockResolvedValue({
    premium: { stripeSubscriptionId: "sub_123", _count: { users } },
  } as any);
}
