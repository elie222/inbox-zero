"use client";

import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";

// The chat onboarding experiment is parked. ChatOnboarding and its config stay
// in the tree, but it is not imported here so its bundle is not shipped. To
// bring it back, gate on the "onboarding-chat" flag again:
//
//   const flagVariant = useOnboardingChatVariant();
//   const variant = forcedVariant === "chat" || forcedVariant === "control"
//     ? forcedVariant
//     : flagVariant;
//   if (variant === "chat") return <ChatOnboarding />;
//
// where `forcedVariant` came from the `variant` search param for QA.
export function Onboarding({ step }: { step?: string }) {
  return <OnboardingContent step={step} />;
}
