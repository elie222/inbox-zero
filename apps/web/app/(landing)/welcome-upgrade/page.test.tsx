// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeUpgradePage from "./page";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  pricing: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/utils/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/(landing)/home/Footer", () => ({ Footer: () => null }));
vi.mock("@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav", () => ({
  WelcomeUpgradeNav: () => null,
}));
vi.mock("@/app/(landing)/welcome-upgrade/Testimonial", () => ({
  Testimonial: () => null,
}));
vi.mock("@/app/(landing)/welcome-upgrade/WelcomeUpgradePricing", () => ({
  WelcomeUpgradePricing: mocks.pricing,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upgrade page authentication", () => {
  it("requires sign-in and preserves the upgrade destination", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(
      Promise.resolve().then(() =>
        WelcomeUpgradePage({ searchParams: Promise.resolve({}) }),
      ),
    ).rejects.toThrow("redirect:/login?next=%2Fwelcome-upgrade");
  });
  it("allows a signed-in user to reach the upgrade page", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-test" } });
    await WelcomeUpgradePage({ searchParams: Promise.resolve({}) });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("checkout return destination", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ user: { id: "user-test" } });
  });

  it("sends paywall-first users back to onboarding after checkout", async () => {
    render(
      await WelcomeUpgradePage({
        searchParams: Promise.resolve({ returnTo: "onboarding" }),
      }),
    );
    expect(mocks.pricing).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutReturnTo: "onboarding" }),
      undefined,
    );
  });

  it("drops unknown return destinations", async () => {
    render(
      await WelcomeUpgradePage({
        searchParams: Promise.resolve({ returnTo: "https://evil.example" }),
      }),
    );
    expect(mocks.pricing).toHaveBeenCalledWith(
      expect.objectContaining({ checkoutReturnTo: undefined }),
      undefined,
    );
  });
});
