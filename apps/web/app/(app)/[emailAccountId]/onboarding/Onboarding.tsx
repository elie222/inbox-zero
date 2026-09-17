"use client";

import { ChatOnboarding } from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboarding";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import {
  useOnboardingChatVariant,
  type OnboardingChatVariant,
} from "@/hooks/useFeatureFlags";

// A/B experiment gate: "chat" gets the conversational onboarding, "control"
// keeps the step-based flow. While the flag resolves this renders the control
// flow, which shows nothing until its own data loads — so a late flag flip is
// not visible to the user in practice.
// The optional `variant` search param forces an arm for previewing/QA where
// PostHog is unavailable.
export function Onboarding({
  step,
  forcedVariant,
}: {
  step?: string;
  forcedVariant?: string;
}) {
  const flagVariant = useOnboardingChatVariant();
  const variant: OnboardingChatVariant =
    forcedVariant === "chat" || forcedVariant === "control"
      ? forcedVariant
      : flagVariant;

  if (variant === "chat") return <ChatOnboarding />;

  return <OnboardingContent step={step} />;
}
