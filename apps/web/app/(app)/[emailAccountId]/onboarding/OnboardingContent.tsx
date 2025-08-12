"use client";

import { useEffect } from "react";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepIntro } from "@/app/(app)/[emailAccountId]/onboarding/StepIntro";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { StepDigest } from "@/app/(app)/[emailAccountId]/onboarding/StepDigest";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import type { PersonaAnalysis } from "@/utils/ai/knowledge/persona";

interface OnboardingContentProps {
  emailAccountId: string;
  step: number;
}

export function OnboardingContent({
  emailAccountId,
  step,
}: OnboardingContentProps) {
  const { data, mutate } = usePersona();
  const clampedStep = Math.min(Math.max(step, 1), 4);

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
      return <StepIntro emailAccountId={emailAccountId} />;
    case 2:
      return (
        <StepWho
          initialRole={
            (data?.personaAnalysis as PersonaAnalysis | null)?.persona || null
          }
          emailAccountId={emailAccountId}
        />
      );
    case 3:
      return <StepLabels emailAccountId={emailAccountId} />;
    case 4:
      return <StepDigest emailAccountId={emailAccountId} />;
    default:
      return <StepIntro emailAccountId={emailAccountId} />;
  }
}
