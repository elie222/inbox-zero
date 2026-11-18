"use client";

import { useLingui } from "@lingui/react/macro";
import { EmailAppIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailAppIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepMailApp({ onNext }: { onNext: () => void }) {
  const { t } = useLingui();

  return (
    <OnboardingFeatureStep
      illustration={<EmailAppIllustration />}
      title={t`Want a faster inbox too?`}
      description={t`Inbox Zero works in Gmail or Outlook, so you don't need to switch. If you want, use our email app on web, desktop, iPhone, and Android.`}
      onNext={onNext}
    />
  );
}
