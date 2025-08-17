"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepIntro } from "@/app/(app)/[emailAccountId]/onboarding/StepIntro";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { StepExtension } from "@/app/(app)/[emailAccountId]/onboarding/StepExtension";
import { StepFeatures } from "@/app/(app)/[emailAccountId]/onboarding/StepFeatures";
import { StepDraft } from "@/app/(app)/[emailAccountId]/onboarding/StepDraft";
import { StepCustomRules } from "@/app/(app)/[emailAccountId]/onboarding/StepCustomRules";
import {
  ASSISTANT_ONBOARDING_COOKIE,
  markOnboardingAsCompleted,
} from "@/utils/cookies";
import { completedOnboardingAction } from "@/utils/actions/onboarding";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { prefixPath } from "@/utils/path";

const ONBOARDING_STEPS = 7;

const nextUrl = (emailAccountId: string, step: number) => {
  if (step >= ONBOARDING_STEPS) return "/welcome-upgrade";
  return prefixPath(emailAccountId, `/onboarding?step=${step + 1}`);
};

interface OnboardingContentProps {
  emailAccountId: string;
  step: number;
}

export function OnboardingContent({
  emailAccountId,
  step,
}: OnboardingContentProps) {
  const { data, mutate } = usePersona();
  const clampedStep = Math.min(Math.max(step, 1), ONBOARDING_STEPS);

  const router = useRouter();
  const analytics = useOnboardingAnalytics("onboarding");

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const onNext = useCallback(() => {
    analytics.onNext(clampedStep);
    router.push(nextUrl(emailAccountId, clampedStep));
  }, [router, emailAccountId, analytics, clampedStep]);

  const onCompleted = useCallback(async () => {
    analytics.onComplete();
    markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
    await completedOnboardingAction();
    onNext();
  }, [onNext, analytics]);

  // Trigger persona analysis on mount (first step only)
  useEffect(() => {
    if (clampedStep === 1 && !data?.personaAnalysis) {
      // Run persona analysis in the background
      analyzePersonaAction(emailAccountId)
        .then(() => {
          mutate();
        })
        .catch((error) => {
          // Fail silently - persona analysis is optional enhancement
          console.error("Failed to analyze persona:", error);
        });
    }
  }, [clampedStep, emailAccountId, data?.personaAnalysis, mutate]);

  switch (clampedStep) {
    case 1:
      return <StepIntro onNext={onNext} />;
    case 2:
      return <StepFeatures onNext={onNext} />;
    case 3:
      return (
        <StepWho
          initialRole={data?.role || data?.personaAnalysis?.persona}
          emailAccountId={emailAccountId}
          onNext={onNext}
        />
      );
    case 4:
      return <StepLabels emailAccountId={emailAccountId} onNext={onNext} />;
    case 5:
      return <StepDraft emailAccountId={emailAccountId} onNext={onNext} />;
    case 6:
      return <StepCustomRules onNext={onNext} />;
    // case 6:
    //   return <StepDigest onNext={onNext} />;
    case 7:
      return <StepExtension onNext={onCompleted} />;
    default:
      return <StepIntro onNext={onNext} />;
  }
}
