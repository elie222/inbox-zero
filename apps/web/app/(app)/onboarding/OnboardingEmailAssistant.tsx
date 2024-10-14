"use client";

import { Suspense } from "react";
import { RulesPromptForm } from "@/app/(app)/automation/RulesPrompt";
import { OnboardingNextButton } from "@/app/(app)/onboarding/OnboardingNextButton";

export function OnboardingAIEmailAssistant() {
  return (
    <div>
      <RulesPromptForm rulesPrompt="" mutate={() => {}} />

      <Suspense>
        <OnboardingNextButton />
      </Suspense>
    </div>
  );
}
