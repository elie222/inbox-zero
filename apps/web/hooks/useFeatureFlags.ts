import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from "posthog-js/react";

// export function useReplyTrackingEnabled() {
//   return useFeatureFlagEnabled("reply-tracker");
// }

const HERO_FLAG_NAME = "hero-copy-7";

export type HeroVariant = "control" | "clean-up-in-minutes";

export function useHeroVariant() {
  return (useFeatureFlagVariantKey(HERO_FLAG_NAME) as HeroVariant) || "control";
}

export function useHeroVariantEnabled() {
  return useFeatureFlagEnabled(HERO_FLAG_NAME);
}

// export type PricingVariant = "control" | "business-only" | "basic-business";

// export function usePricingVariant() {
//   return (
//     (useFeatureFlagVariantKey("pricing-options") as PricingVariant) || "control"
//   );
// }
