import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from "posthog-js/react";
import { env } from "@/env";

export function useCleanerEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("inbox-cleaner");
  return env.NEXT_PUBLIC_CLEANER_ENABLED || posthogEnabled;
}

export function useFollowUpRemindersEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("follow-up-reminders");
  return env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED || posthogEnabled;
}

export function useMeetingBriefsEnabled() {
  return env.NEXT_PUBLIC_MEETING_BRIEFS_ENABLED;
}

export function useIntegrationsEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("integrations");
  return env.NEXT_PUBLIC_INTEGRATIONS_ENABLED || posthogEnabled;
}

export function useSmartFilingEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("smart-filing");
  return env.NEXT_PUBLIC_SMART_FILING_ENABLED || posthogEnabled;
}

export function useBookingLinksEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("booking-links");
  return env.NEXT_PUBLIC_BOOKING_LINKS_ENABLED || posthogEnabled;
}

export function useTeamsEnabled() {
  return useFeatureFlagEnabled("microsoft-teams");
}

const HERO_FLAG_NAME = "hero-copy-7";

export type HeroVariant = "control" | "clean-up-in-minutes";

export function useHeroVariant() {
  return (useFeatureFlagVariantKey(HERO_FLAG_NAME) as HeroVariant) || "control";
}

export function useHeroVariantEnabled() {
  return useFeatureFlagEnabled(HERO_FLAG_NAME);
}

export type PricingVariant = "control" | "basic-business" | "business-basic";

export function usePricingVariant() {
  return (
    (useFeatureFlagVariantKey("pricing-options-2") as PricingVariant) ||
    "control"
  );
}

export type PricingFrequencyDefault = "control" | "monthly";

export function usePricingFrequencyDefault() {
  return (
    (useFeatureFlagVariantKey(
      "pricing-frequency-default",
    ) as PricingFrequencyDefault) || "control"
  );
}

export type TestimonialsVariant = "control" | "senja-widget";

export function useTestimonialsVariant() {
  return (
    (useFeatureFlagVariantKey("testimonials") as TestimonialsVariant) ||
    "control"
  );
}

export type WelcomePricingVariant = "control" | "two-tiers";

export function useWelcomePricingVariant() {
  return (
    (useFeatureFlagVariantKey(
      "welcome-pricing-tiers",
    ) as WelcomePricingVariant) || "control"
  );
}

export type OnboardingBulkUnsubscribeVariant = "control" | "inline-unsubscribe";

// A/B test for the onboarding bulk-unsubscribe step: "control" shows the
// static marketing slide, "inline-unsubscribe" shows the personalized,
// actionable list. Reading the flag here is the experiment exposure
// ($feature_flag_called). Defaults to control until the flag resolves and when
// PostHog is unavailable (e.g. self-hosted), preserving the existing step.
export function useOnboardingBulkUnsubscribeVariant() {
  return (
    (useFeatureFlagVariantKey(
      "onboarding-bulk-unsubscribe",
    ) as OnboardingBulkUnsubscribeVariant) || "control"
  );
}
