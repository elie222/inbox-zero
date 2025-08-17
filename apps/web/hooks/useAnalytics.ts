import { usePostHog } from "posthog-js/react";
import { useMemo } from "react";

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
