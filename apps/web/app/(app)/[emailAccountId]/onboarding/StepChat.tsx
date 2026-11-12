"use client";

import { useLingui } from "@lingui/react/macro";
import { ChatIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/ChatIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepChat({ onNext }: { onNext: () => void }) {
  const { t } = useLingui();

  return (
    <OnboardingFeatureStep
      illustration={<ChatIllustration />}
      title={t`A chat that runs your email`}
      description={t`Clean up, draft replies, set up rules. Works in Slack, Telegram, or here, and pings you when you're needed.`}
      onNext={onNext}
    />
  );
}
