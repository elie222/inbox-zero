"use client";

import { useEffect } from "react";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepIntro } from "@/app/(app)/[emailAccountId]/onboarding/StepIntro";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { StepExtension } from "@/app/(app)/[emailAccountId]/onboarding/StepExtension";
import { StepDigest } from "@/app/(app)/[emailAccountId]/onboarding/StepDigest";
import { StepFeatures } from "@/app/(app)/[emailAccountId]/onboarding/StepFeatures";
import { ONBOARDING_STEPS } from "@/app/(app)/[emailAccountId]/onboarding/config";

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
      return <StepIntro emailAccountId={emailAccountId} step={1} />;
    case 2:
      return <StepFeatures emailAccountId={emailAccountId} step={2} />;
    case 3:
      return (
        <StepWho
          initialRole={data?.role || data?.personaAnalysis?.persona}
          emailAccountId={emailAccountId}
          step={3}
        />
      );
    case 4:
      return <StepLabels emailAccountId={emailAccountId} step={4} />;
    // case 5:
    //   return <StepDigest emailAccountId={emailAccountId} step={5} />;
    case 5:
      return <StepExtension emailAccountId={emailAccountId} step={5} />;
    default:
      return <StepIntro emailAccountId={emailAccountId} step={1} />;
  }
}
