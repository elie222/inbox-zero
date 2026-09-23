/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PremiumAlertWithData } from "@/components/PremiumAlert";

(globalThis as { React?: typeof React }).React = React;

const mockUsePremium = vi.fn();

vi.mock("@/hooks/usePremium", () => ({
  usePremium: () => mockUsePremium(),
}));

vi.mock("@/app/(app)/premium/PremiumModal", () => ({
  usePremiumModal: () => ({ PremiumModal: () => null, openModal: vi.fn() }),
}));

vi.mock("@/components/EndTrialButton", () => ({
  EndTrialButton: () => <button type="button">Start paid plan now</button>,
}));

describe("PremiumAlertWithData", () => {
  afterEach(() => {
    cleanup();
    mockUsePremium.mockReset();
  });

  it("tells trial users an active subscription is required even though they have AI access", () => {
    mockUsePremium.mockReturnValue(
      premiumState({ stripeSubscriptionStatus: "trialing" }),
    );

    render(<PremiumAlertWithData activeOnly />);

    expect(screen.getByText("Active Subscription Required")).toBeTruthy();
    expect(screen.getByText("Start paid plan now")).toBeTruthy();
  });

  it("shows nothing to trial users on features that allow trials", () => {
    mockUsePremium.mockReturnValue(
      premiumState({ stripeSubscriptionStatus: "trialing" }),
    );

    const { container } = render(<PremiumAlertWithData />);

    expect(container.innerHTML).toBe("");
  });

  it("offers an upgrade instead of trial copy when the subscription lapsed", () => {
    mockUsePremium.mockReturnValue({
      ...premiumState({ stripeSubscriptionStatus: "past_due" }),
      hasAiAccess: false,
    });

    render(<PremiumAlertWithData activeOnly />);

    expect(screen.queryByText("Active Subscription Required")).toBeNull();
    expect(screen.getByText("Premium Feature")).toBeTruthy();
  });

  it("shows nothing to active subscribers", () => {
    mockUsePremium.mockReturnValue(
      premiumState({ stripeSubscriptionStatus: "active" }),
    );

    const { container } = render(<PremiumAlertWithData activeOnly />);

    expect(container.innerHTML).toBe("");
  });
});

function premiumState({
  stripeSubscriptionStatus,
}: {
  stripeSubscriptionStatus: string;
}) {
  return {
    hasAiAccess: true,
    isLoading: false,
    isProPlanWithoutApiKey: false,
    tier: "STARTER_MONTHLY",
    premium: { tier: "STARTER_MONTHLY", stripeSubscriptionStatus },
  };
}
