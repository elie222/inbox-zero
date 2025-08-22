"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepIntro } from "@/app/(app)/[emailAccountId]/onboarding/StepIntro";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
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
import { useAccount } from "@/providers/EmailAccountProvider";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import { isDefined } from "@/utils/types";

interface OnboardingContentProps {
  step: number;
}

export function OnboardingContent({ step }: OnboardingContentProps) {
  const { emailAccountId } = useAccount();

  useSignUpEvent();

  const steps = [
    () => <StepIntro onNext={onNext} />,
    () => <StepFeatures onNext={onNext} />,
    () => (
      <StepWho
        initialRole={data?.role || data?.personaAnalysis?.persona}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    () => <StepLabels emailAccountId={emailAccountId} onNext={onNext} />,
    () => <StepDraft emailAccountId={emailAccountId} onNext={onNext} />,
    // <StepDigest onNext={onNext} />
    () => <StepCustomRules onNext={onNext} />,
  ].filter(isDefined);

  const { data, mutate } = usePersona();
  const clampedStep = Math.min(Math.max(step, 1), steps.length);

  const router = useRouter();
  const analytics = useOnboardingAnalytics("onboarding");

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const onNext = useCallback(async () => {
    analytics.onNext(clampedStep);
    if (clampedStep < steps.length) {
      router.push(
        prefixPath(emailAccountId, `/onboarding?step=${clampedStep + 1}`),
      );
    } else {
      analytics.onComplete();
      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
      await completedOnboardingAction();
      router.push("/welcome-upgrade");
    }
  }, [router, emailAccountId, analytics, clampedStep, steps.length]);

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

  const renderStep = steps[clampedStep - 1] || steps[0];

  return renderStep ? renderStep() : null;
}
