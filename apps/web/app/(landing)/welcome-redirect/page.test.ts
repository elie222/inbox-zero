import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUser: vi.fn(),
  findPremium: vi.fn(),
  redirectToEmailAccountPath: vi.fn((path: string) => {
    throw new Error(`account-redirect:${path}`);
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  env: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

vi.mock("@/utils/auth", () => ({
  auth: () => mocks.auth(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: Parameters<typeof mocks.findUser>) =>
        mocks.findUser(...args),
    },
    premium: {
      findUnique: (...args: Parameters<typeof mocks.findPremium>) =>
        mocks.findPremium(...args),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock("@/utils/account", () => ({
  redirectToEmailAccountPath: (path: string) =>
    mocks.redirectToEmailAccountPath(path),
}));

vi.mock("@/env", () => ({
  env: mocks.env,
}));

import { premiumEntitlementSelect } from "@/utils/premium";
import WelcomeRedirectPage from "./page";

describe("WelcomeRedirectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("sends completed web users to automation without loading premium", async () => {
    mocks.findUser.mockResolvedValue({
      completedOnboardingAt: new Date("2026-01-01T00:00:00.000Z"),
      premiumId: "premium-1",
    });

    await expect(
      WelcomeRedirectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("account-redirect:/automation");

    expect(mocks.findPremium).not.toHaveBeenCalled();
  });

  it("sends mobile-paid users with active Apple premium to setup", async () => {
    mocks.findUser.mockResolvedValue({
      completedOnboardingAt: null,
      premiumId: "premium-1",
    });
    mocks.findPremium.mockResolvedValue({
      appleExpiresAt: new Date("2099-07-01T00:00:00.000Z"),
      appleRevokedAt: null,
      appleSubscriptionStatus: "ACTIVE",
      lemonSqueezyRenewsAt: null,
      stripeSubscriptionStatus: null,
      tier: "STARTER_MONTHLY",
    });

    await expect(
      WelcomeRedirectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("account-redirect:/setup");

    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        completedOnboardingAt: true,
        premiumId: true,
      },
    });
    expect(mocks.findPremium).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      select: premiumEntitlementSelect,
    });
    expect(mocks.redirectToEmailAccountPath).toHaveBeenCalledWith("/setup");
  });

  it("keeps incomplete users without premium in onboarding", async () => {
    mocks.findUser.mockResolvedValue({
      completedOnboardingAt: null,
      premiumId: null,
    });

    await expect(
      WelcomeRedirectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/onboarding");

    expect(mocks.findPremium).not.toHaveBeenCalled();
  });

  it("keeps incomplete users with expired premium in onboarding", async () => {
    mocks.findUser.mockResolvedValue({
      completedOnboardingAt: null,
      premiumId: "premium-1",
    });
    mocks.findPremium.mockResolvedValue({
      appleExpiresAt: new Date("2020-07-01T00:00:00.000Z"),
      appleRevokedAt: null,
      appleSubscriptionStatus: "EXPIRED",
      lemonSqueezyRenewsAt: null,
      stripeSubscriptionStatus: null,
      tier: "STARTER_MONTHLY",
    });

    await expect(
      WelcomeRedirectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/onboarding");
  });

  it("honors forced onboarding for premium users", async () => {
    mocks.findUser.mockResolvedValue({
      completedOnboardingAt: null,
      premiumId: "premium-1",
    });

    await expect(
      WelcomeRedirectPage({
        searchParams: Promise.resolve({ force: true }),
      }),
    ).rejects.toThrow("redirect:/onboarding");

    expect(mocks.findPremium).not.toHaveBeenCalled();
    expect(mocks.redirectToEmailAccountPath).not.toHaveBeenCalled();
  });
});
