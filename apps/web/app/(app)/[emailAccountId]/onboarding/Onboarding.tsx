"use client";

import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";

// The chat onboarding experiment is parked on the `parked/chat-onboarding` branch.
export function Onboarding({ step }: { step?: string }) {
  return <OnboardingContent step={step} />;
}
