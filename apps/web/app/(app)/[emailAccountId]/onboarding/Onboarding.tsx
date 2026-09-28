"use client";

import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";

export function Onboarding({ step }: { step?: string }) {
  return <OnboardingContent step={step} />;
}
