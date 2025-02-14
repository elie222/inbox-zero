import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from "posthog-js/react";

// export function useReplyTrackingEnabled() {
//   return useFeatureFlagEnabled("reply-tracker");
// }

const HERO_FLAG_NAME = "hero-copy-5";

export type HeroVariant =
  | "control"
  | "clean-up-in-minutes"
  | "meet-your-ai-assistant"
  | "meet-your-ai-assistant-2";

export function useHeroVariant() {
  return (useFeatureFlagVariantKey(HERO_FLAG_NAME) as HeroVariant) || "control";
}

export function useHeroVariantEnabled() {
  return useFeatureFlagEnabled(HERO_FLAG_NAME);
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
