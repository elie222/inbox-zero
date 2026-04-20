// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboardingAnalytics } from "./useAnalytics";

const capture = vi.fn();

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture }),
}));

describe("useOnboardingAnalytics", () => {
  beforeEach(() => {
    capture.mockReset();
  });

  it("marks skipped steps as both skipped and completed", () => {
    const { result } = renderHook(() => useOnboardingAnalytics("onboarding"));

    result.current.onSkip({
      step: 3,
      stepKey: "inviteTeam",
      totalSteps: 10,
      isOptional: true,
    });

    expect(capture).toHaveBeenNthCalledWith(1, "onboarding_step_skipped", {
      variant: "onboarding",
      step: 3,
      stepKey: "inviteTeam",
      totalSteps: 10,
      isOptional: true,
      skipped: true,
    });
    expect(capture).toHaveBeenNthCalledWith(2, "onboarding_step_completed", {
      variant: "onboarding",
      step: 3,
      stepKey: "inviteTeam",
      totalSteps: 10,
      isOptional: true,
      skipped: true,
    });
  });
});
