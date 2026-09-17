import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldShowPaywallFirst } from "./paywallFirst";

const { getServerFeatureFlagVariant } = vi.hoisted(() => ({
  getServerFeatureFlagVariant: vi.fn(),
}));
vi.mock("@/utils/posthog", () => ({ getServerFeatureFlagVariant }));

const user = { email: "user@example.com", isPremium: false };

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
    expect(await shouldShowPaywallFirst({ ...user, forced: "false" })).toBe(
      true,
    );
  });

  it("shows the paywall only for the paywall-first variant", async () => {
    getServerFeatureFlagVariant.mockResolvedValue("paywall-first");
    expect(await shouldShowPaywallFirst(user)).toBe(true);
    expect(getServerFeatureFlagVariant).toHaveBeenCalledWith({
      key: "onboarding-paywall-first",
      distinctId: "user@example.com",
    });

    getServerFeatureFlagVariant.mockResolvedValue("control");
    expect(await shouldShowPaywallFirst(user)).toBe(false);
  });

  it("falls back to control when the flag is unavailable", async () => {
    getServerFeatureFlagVariant.mockResolvedValue(undefined);
    expect(await shouldShowPaywallFirst(user)).toBe(false);
  });
});
