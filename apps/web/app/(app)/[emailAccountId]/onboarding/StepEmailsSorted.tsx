"use client";

import { EmailsSortedIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepEmailsSorted({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingFeatureStep
      illustration={<EmailsSortedIllustration />}
      title="Your inbox, automatically sorted"
      description={
        'Every email gets a label like "To Reply", "Newsletter", or "Cold Email".'
      }
      onNext={onNext}
    />
  );
}
