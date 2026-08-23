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
  const posthogEnabled = useFeatureFlagEnabled("meeting-recorder");
  return env.NEXT_PUBLIC_MEETING_RECORDER_ENABLED || posthogEnabled;
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

export function useMailboxSyncEnabled() {
  return useFeatureFlagEnabled("mailbox-sync-disabled") !== true;
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

export type PricingFrequencyDefault = "control" | "monthly" | "annually";

export function usePricingFrequencyDefault():
  | PricingFrequencyDefault
  | undefined {
  return useFeatureFlagVariantKey("pricing-frequency-default") as
    | PricingFrequencyDefault
    | undefined;
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
export type OnboardingChatVariant = "control" | "chat";

export function useOnboardingChatVariant() {
  return (
    (useFeatureFlagVariantKey("onboarding-chat") as OnboardingChatVariant) ||
    "control"
  );
}
