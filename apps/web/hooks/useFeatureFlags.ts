import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from "posthog-js/react";
import { env } from "@/env";

export function useCleanerEnabled() {
  return useFeatureFlagEnabled("inbox-cleaner");
}

export function useMeetingBriefsEnabled() {
  return env.NEXT_PUBLIC_MEETING_BRIEFS_ENABLED;
}

export function useIntegrationsEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("integrations");
  return posthogEnabled || env.NEXT_PUBLIC_INTEGRATIONS_ENABLED;
}

export function useAutoFileEnabled() {
  const posthogEnabled = useFeatureFlagEnabled("smart-filing");
  return posthogEnabled || env.NEXT_PUBLIC_SMART_FILING_ENABLED;
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
