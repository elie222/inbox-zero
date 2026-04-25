import { describe, expect, it } from "vitest";
import { getWelcomeRedirectPath } from "./welcome-redirect";

describe("getWelcomeRedirectPath", () => {
  it("sends users without a mailbox to the connect flow", () => {
    expect(
      getWelcomeRedirectPath({
        completedOnboardingAt: null,
        emailAccountCount: 0,
        forceOnboarding: false,
      }),
    ).toBe("/connect-mailbox");

    expect(
      getWelcomeRedirectPath({
        completedOnboardingAt: new Date(),
        emailAccountCount: 0,
        forceOnboarding: true,
      }),
    ).toBe("/connect-mailbox");
  });

  it("respects forced onboarding when a mailbox exists", () => {
    expect(
      getWelcomeRedirectPath({
        completedOnboardingAt: new Date(),
        emailAccountCount: 1,
        forceOnboarding: true,
      }),
    ).toBe("/onboarding");
  });

  it("routes returning users with a mailbox to setup", () => {
    expect(
      getWelcomeRedirectPath({
        completedOnboardingAt: new Date(),
        emailAccountCount: 1,
        forceOnboarding: false,
      }),
    ).toBe("/setup");
  });

  it("routes new users with a mailbox to onboarding", () => {
    expect(
      getWelcomeRedirectPath({
        completedOnboardingAt: null,
        emailAccountCount: 1,
        forceOnboarding: false,
      }),
    ).toBe("/onboarding");
  });
});
