"use client";

import { useLingui } from "@lingui/react/macro";
import { DraftRepliesIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/DraftRepliesIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepDraftReplies({ onNext }: { onNext: () => void }) {
  const { t } = useLingui();

  return (
    <OnboardingFeatureStep
      illustration={<DraftRepliesIllustration />}
      title={t`Drafts ready to send`}
      description={t`Every email needing a reply gets a draft, written in your tone.`}
      onNext={onNext}
    />
  );
}
