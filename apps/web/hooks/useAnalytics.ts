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
  skipped?: boolean;
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

    const safeCapture = (
      event: string,
      properties?: OnboardingAnalyticsProps | Record<string, unknown>,
    ) => {
      try {
        posthog.capture(event, properties);
      } catch {}
    };

    return {
      onStart: (properties?: number | OnboardingAnalyticsProps) => {
        safeCapture("onboarding_started", {
          variant,
          ...getProperties(properties),
        });
      },
      onStepViewed: (properties?: number | OnboardingAnalyticsProps) => {
        safeCapture("onboarding_step_viewed", {
          variant,
          ...getProperties(properties),
        });
      },
      onNext: (properties?: number | OnboardingAnalyticsProps) => {
        const stepProperties = getProperties(properties);

        safeCapture("onboarding_next", { variant, ...stepProperties });
        safeCapture("onboarding_step_completed", {
          variant,
          ...stepProperties,
        });
      },
      onSkip: (properties?: number | OnboardingAnalyticsProps) => {
        const stepProperties = getProperties(properties);

        safeCapture("onboarding_step_skipped", {
          variant,
          ...stepProperties,
          skipped: true,
        });
        safeCapture("onboarding_step_completed", {
          variant,
          ...stepProperties,
          skipped: true,
        });
      },
      onComplete: (properties?: OnboardingAnalyticsProps) => {
        safeCapture("onboarding_completed", {
          variant,
          ...getProperties(properties),
        });
      },
    };
  }, [posthog, variant]);
}

export const landingPageAnalytics = {
  videoClicked: (posthog: PostHog, videoId: string) => {
    posthog?.capture?.("Landing Page Video Clicked", { video_id: videoId });
  },
  videoStarted: (posthog: PostHog, videoId: string) => {
    posthog?.capture?.("Landing Page Video Started", { video_id: videoId });
  },
  videoProgress: (
    posthog: PostHog,
    videoId: string,
    progressPercent: number,
  ) => {
    posthog?.capture?.("Landing Page Video Progress", {
      video_id: videoId,
      progress_percent: progressPercent,
    });
  },
  videoCompleted: (posthog: PostHog, videoId: string) => {
    posthog?.capture?.("Landing Page Video Completed", { video_id: videoId });
  },
  videoClosed: (posthog: PostHog, videoId: string) => {
    posthog?.capture?.("Landing Page Video Closed", { video_id: videoId });
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
  pricingCtaClicked: (
    posthog: PostHog,
    properties: {
      tier: string;
      cta: string;
      frequency: "monthly" | "annually";
      defaultFrequency: "monthly" | "annually";
      frequencySource: "default" | "user_selected";
      pricingFrequencyDefaultVariant: string | null;
    },
  ) => {
    posthog?.capture?.("Clicked Pricing CTA", properties);
  },
  appDownloadClicked: (posthog: PostHog, platform: "ios" | "android") => {
    posthog?.capture?.("Clicked App Download", { platform });
  },
};
