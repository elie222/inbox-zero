import { useFeatureFlagVariantKey } from "posthog-js/react";

export function useSmartCategoriesEnabled() {
  // return useFeatureFlagEnabled("smart-categories");
  return true;
}

export type HeroVariant =
  | "control"
  | "clean-up-in-minutes"
  | "meet-your-ai-assistant"
  | "meet-your-ai-assistant-2";

export function useHeroVariant() {
  return (useFeatureFlagVariantKey("hero-copy-5") as HeroVariant) || "control";
}

export type LandingPageAIAssistantVariant = "control" | "magic";

export function useLandingPageAIAssistantVariant() {
  return (
    (useFeatureFlagVariantKey(
      "landing-page-ai-assistant",
    ) as LandingPageAIAssistantVariant) || "control"
  );
}

export type PricingVariant = "control" | "business-only" | "basic-business";

export function usePricingVariant() {
  return (
    (useFeatureFlagVariantKey("pricing-options") as PricingVariant) || "control"
  );
}
