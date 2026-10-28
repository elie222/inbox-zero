"use client";

import { DraftRepliesIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/DraftRepliesIllustration";
import { OnboardingFeatureStep } from "./OnboardingFeatureStep";

export function StepDraftReplies({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingFeatureStep
      illustration={<DraftRepliesIllustration />}
      title="Drafts ready to send"
      description={
        "Every email needing a reply gets a draft, written in your tone."
      }
      onNext={onNext}
    />
  );
}
