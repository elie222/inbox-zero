"use client";

import { ChatIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/ChatIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepChat({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingFeatureStep
      illustration={<ChatIllustration />}
      title="A chat that runs your email"
      description={
        "Clean up, draft replies, set up rules. Works in Slack, Telegram, or here, and pings you when you're needed."
      }
      onNext={onNext}
    />
  );
}
