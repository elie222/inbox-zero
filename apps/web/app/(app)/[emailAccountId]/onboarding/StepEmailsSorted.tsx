"use client";

import { useLingui } from "@lingui/react/macro";
import { EmailsSortedIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepEmailsSorted({ onNext }: { onNext: () => void }) {
  const { t } = useLingui();

  return (
    <OnboardingFeatureStep
      illustration={<EmailsSortedIllustration />}
      title={t`Your inbox, automatically sorted`}
      description={t`Every email gets a label like "To Reply", "Newsletter", or "Cold Email".`}
      onNext={onNext}
    />
  );
}
