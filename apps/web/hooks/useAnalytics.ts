import { usePostHog } from "posthog-js/react";
import { useMemo } from "react";
import type { PostHog } from "posthog-js";

export function useOnboardingAnalytics(variant: "onboarding" | "welcome") {
  const posthog = usePostHog();

  return useMemo(() => {
    return {
      onStart: () => {
        posthog.capture("onboarding_started", { variant });
      },
      onNext: (step: number) => {
        posthog.capture("onboarding_next", { variant, step });
      },
      onComplete: () => {
        posthog.capture("onboarding_completed", { variant });
      },
    };
  }, [posthog, variant]);
}

export const landingPageAnalytics = {
  videoClicked: (posthog: PostHog) => {
    posthog?.capture?.("Landing Page Video Clicked");
  },
  getStartedClicked: (posthog: PostHog) => {
    posthog?.capture?.("Clicked Get Started");
  },
  talkToSalesClicked: (posthog: PostHog) => {
    posthog?.capture?.("Clicked talk to sales");
  },
  logInClicked: (posthog: PostHog, position?: string) => {
    posthog?.capture?.("Clicked Log In", position ? { position } : undefined);
  },
  signUpClicked: (posthog: PostHog, position?: string) => {
    posthog?.capture?.("Clicked Sign Up", position ? { position } : undefined);
  },
  pricingCtaClicked: (posthog: PostHog, tier: string, cta: string) => {
    posthog?.capture?.("Clicked Pricing CTA", { tier, cta });
  },
};
