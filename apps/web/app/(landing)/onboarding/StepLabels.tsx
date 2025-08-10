"use client";

import { Settings2Icon } from "lucide-react";
import { IconCircle } from "@/app/(landing)/onboarding/IconCircle";
import { PageHeading, TypographyP } from "@/components/Typography";
import { OnboardingWrapper } from "@/app/(landing)/onboarding/OnboardingWrapper";

export function StepLabels() {
  return (
    <div className="grid grid-cols-2">
      <OnboardingWrapper>
        <IconCircle size="lg" className="mx-auto">
          <Settings2Icon className="size-6" />
        </IconCircle>

        <div className="text-center mt-4">
          <PageHeading>How do you want your inbox organized?</PageHeading>
          <TypographyP className="mt-2 max-w-lg mx-auto">
            We'll use these labels to organize your inbox. You can change them
            later.
          </TypographyP>
        </div>
      </OnboardingWrapper>

      <div className="bg-white h-screen">x</div>
    </div>
  );
}
