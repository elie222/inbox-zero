import { useFeatureFlagVariantKey } from "posthog-js/react";

export function useSmartCategoriesEnabled() {
  // return useFeatureFlagEnabled("smart-categories");
  return true;
}

export function useLandingPageVariant() {
  return useFeatureFlagVariantKey("landing-page-features");
}

export function useAppOnboardingVariant() {
  return useFeatureFlagVariantKey("app-onboarding");
}
