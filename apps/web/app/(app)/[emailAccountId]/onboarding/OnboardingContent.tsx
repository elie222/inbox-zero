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

interface OnboardingContentProps {
  emailAccountId: string;
  step: number;
}

export function OnboardingContent({
  emailAccountId,
  step,
}: OnboardingContentProps) {
  const { data, mutate } = usePersona();
  const clampedStep = Math.min(Math.max(step, 1), 5);
  // const clampedStep = step;

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
    case 0:
      return <StepFeatures />;
    case 1:
      return <StepIntro emailAccountId={emailAccountId} />;
    case 2:
      return (
        <StepWho
          initialRole={data?.role || data?.personaAnalysis?.persona}
          emailAccountId={emailAccountId}
        />
      );
    case 3:
      return <StepLabels />;
    case 4:
      return <StepDigest emailAccountId={emailAccountId} />;
    case 5:
      return <StepExtension />;
    default:
      return <StepIntro emailAccountId={emailAccountId} />;
  }
}
