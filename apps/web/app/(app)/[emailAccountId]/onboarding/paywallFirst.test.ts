import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { shouldShowPaywallFirst } from "./paywallFirst";

const { getServerFeatureFlagVariant } = vi.hoisted(() => ({
  getServerFeatureFlagVariant: vi.fn(),
}));
vi.mock("@/utils/posthog", () => ({ getServerFeatureFlagVariant }));
vi.mock("@/utils/prisma");

const user = {
  userId: "user-id",
  email: "user@example.com",
  isPremium: false,
  storedVariant: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shouldShowPaywallFirst", () => {
  it("never shows the paywall to paying users", async () => {
    getServerFeatureFlagVariant.mockResolvedValue("paywall-first");
    expect(
      await shouldShowPaywallFirst({
        ...user,
        isPremium: true,
        forced: "true",
      }),
    ).toBe(false);
    expect(getServerFeatureFlagVariant).not.toHaveBeenCalled();
  });

  it("honors the QA override without consulting the flag", async () => {
    expect(await shouldShowPaywallFirst({ ...user, forced: "true" })).toBe(
      true,
    );
    expect(getServerFeatureFlagVariant).not.toHaveBeenCalled();
  });

  it("does not let the override opt a user out of the paywall arm", async () => {
    getServerFeatureFlagVariant.mockResolvedValue("paywall-first");
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    expect(await shouldShowPaywallFirst({ ...user, forced: "false" })).toBe(
      true,
    );
  });

  it("reuses the stored variant without evaluating the flag again", async () => {
    expect(
      await shouldShowPaywallFirst({
        ...user,
        storedVariant: "paywall-first",
      }),
    ).toBe(true);

    expect(getServerFeatureFlagVariant).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("shows the paywall only for the paywall-first variant", async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    getServerFeatureFlagVariant.mockResolvedValue("paywall-first");
    expect(await shouldShowPaywallFirst(user)).toBe(true);
    expect(getServerFeatureFlagVariant).toHaveBeenCalledWith({
      key: "onboarding-paywall-first",
      distinctId: "user@example.com",
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-id",
        onboardingPaywallVariant: null,
      },
      data: { onboardingPaywallVariant: "paywall-first" },
    });

    vi.clearAllMocks();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    getServerFeatureFlagVariant.mockResolvedValue("control");
    expect(await shouldShowPaywallFirst(user)).toBe(false);
  });

  it("persists control when the flag is unavailable", async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    getServerFeatureFlagVariant.mockResolvedValue(undefined);
    expect(await shouldShowPaywallFirst(user)).toBe(false);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-id",
        onboardingPaywallVariant: null,
      },
      data: { onboardingPaywallVariant: "control" },
    });
  });

  it("uses the assignment won by a concurrent request", async () => {
    getServerFeatureFlagVariant.mockResolvedValue("paywall-first");
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue({
      onboardingPaywallVariant: "control",
    } as never);

    expect(await shouldShowPaywallFirst(user)).toBe(false);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-id" },
      select: { onboardingPaywallVariant: true },
    });
  });
});
