import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from "posthog-js/react";
import { env } from "@/env";
import {
  INTEGRATION_ACTION_FEATURE_FLAG,
  isIntegrationActionGloballyEnabled,
} from "@/utils/integration-action";

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

export function useMeetingRecorderEnabled() {
  return env.NEXT_PUBLIC_MEETING_RECORDER_ENABLED;
}

// Returns undefined while the PostHog flag is still loading
export function useIntegrationsEnabled(): boolean | undefined {
  const posthogEnabled = useFeatureFlagEnabled("integrations");
  if (env.NEXT_PUBLIC_INTEGRATIONS_ENABLED) return true;
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  return posthogEnabled;
}

export function useIntegrationActionsEnabled(): boolean {
  const posthogEnabled = useFeatureFlagEnabled(INTEGRATION_ACTION_FEATURE_FLAG);
  return isIntegrationActionGloballyEnabled() || posthogEnabled === true;
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

export type PricingFrequencyDefault = "control" | "monthly" | "annually";

export function usePricingFrequencyDefault():
  | PricingFrequencyDefault
  | undefined {
  return useFeatureFlagVariantKey("pricing-frequency-default") as
    | PricingFrequencyDefault
    | undefined;
}

// Not currently wired up: the chat onboarding is parked and not rendered.
// See Onboarding.tsx for how to re-enable it.
export type OnboardingChatVariant = "control" | "chat";

export function useOnboardingChatVariant() {
  return (
    (useFeatureFlagVariantKey("onboarding-chat") as OnboardingChatVariant) ||
    "control"
  );
}
