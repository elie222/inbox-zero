import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from "posthog-js/react";

export function useCleanerEnabled() {
  return useFeatureFlagEnabled("inbox-cleaner");
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

export function useDelayedActionsEnabled() {
  return useFeatureFlagEnabled("delayed-actions");
}

export type TestimonialsVariant = "control" | "senja-widget";

export function useTestimonialsVariant() {
  return (
    (useFeatureFlagVariantKey("testimonials") as TestimonialsVariant) ||
    "control"
  );
}

export type OnboardingVariant = "control" | "new-onboarding";

export function useOnboardingVariant() {
  return (
    (useFeatureFlagVariantKey("onboarding-flow") as OnboardingVariant) ||
    "control"
  );
}

export type PricingCopyVariant = "control" | "free-trial-emphasis";

export function usePricingCopyVariant() {
  return (
    (useFeatureFlagVariantKey("pricing-copy") as PricingCopyVariant) ||
    "control"
  );
}
