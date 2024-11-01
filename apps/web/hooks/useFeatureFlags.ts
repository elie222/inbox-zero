import { useFeatureFlagEnabled } from "posthog-js/react";

export function useSmartCategoriesEnabled() {
  return useFeatureFlagEnabled("smart-categories");
}
