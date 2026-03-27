import { usePostHog } from "posthog-js/react";
import { useMemo } from "react";
import type { PostHog } from "posthog-js";

type OnboardingAnalyticsProps = {
  step?: number;
  stepKey?: string;
  totalSteps?: number;
  nextStep?: number;
  nextStepKey?: string;
  destination?: string;
  isOptional?: boolean;
  flowVariant?: string;
};

export function useOnboardingAnalytics(variant: "onboarding" | "welcome") {
  const posthog = usePostHog();

  return useMemo(() => {
    const getProperties = (
      properties?: number | OnboardingAnalyticsProps,
    ): OnboardingAnalyticsProps =>
      typeof properties === "number"
        ? { step: properties }
        : (properties ?? {});

    return {
      onStart: (properties?: number | OnboardingAnalyticsProps) => {
        posthog.capture("onboarding_started", {
          variant,
          ...getProperties(properties),
        });
      },
      onStepViewed: (properties?: number | OnboardingAnalyticsProps) => {
        posthog.capture("onboarding_step_viewed", {
          variant,
          ...getProperties(properties),
        });
      },
      onNext: (properties?: number | OnboardingAnalyticsProps) => {
        const stepProperties = getProperties(properties);

        posthog.capture("onboarding_next", { variant, ...stepProperties });
        posthog.capture("onboarding_step_completed", {
          variant,
          ...stepProperties,
        });
      },
      onSkip: (properties?: number | OnboardingAnalyticsProps) => {
        posthog.capture("onboarding_step_skipped", {
          variant,
          ...getProperties(properties),
        });
      },
      onComplete: (properties?: OnboardingAnalyticsProps) => {
        posthog.capture("onboarding_completed", {
          variant,
          ...getProperties(properties),
        });
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
