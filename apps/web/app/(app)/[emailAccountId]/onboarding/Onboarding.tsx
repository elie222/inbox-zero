"use client";

import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import type { SignupIntent } from "@/generated/prisma/enums";

// The chat onboarding experiment is parked on the `parked/chat-onboarding` branch.
export function Onboarding({
  step,
  signupIntent,
}: {
  step?: string;
  signupIntent: SignupIntent | null;
}) {
  return <OnboardingContent step={step} signupIntent={signupIntent} />;
}
