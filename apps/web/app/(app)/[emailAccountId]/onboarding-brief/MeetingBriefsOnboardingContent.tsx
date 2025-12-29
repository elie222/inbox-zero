"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { StepConnectCalendar } from "./StepConnectCalendar";
import { StepSendTestBrief } from "./StepSendTestBrief";
import { StepReady } from "./StepReady";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";

const TOTAL_STEPS = 3;

interface MeetingBriefsOnboardingContentProps {
  step: number;
}

export function MeetingBriefsOnboardingContent({
  step,
}: MeetingBriefsOnboardingContentProps) {
  const { emailAccountId } = useAccount();
  const router = useRouter();

  const clampedStep = Math.min(Math.max(step, 1), TOTAL_STEPS);

  const onNext = useCallback(async () => {
    if (clampedStep < TOTAL_STEPS) {
      const nextStep = clampedStep + 1;
      router.push(
        prefixPath(emailAccountId, `/onboarding-brief?step=${nextStep}`),
      );
    }
  }, [router, emailAccountId, clampedStep]);

  return (
    <OnboardingWrapper>
      {clampedStep === 1 && <StepConnectCalendar onNext={onNext} />}
      {clampedStep === 2 && <StepSendTestBrief onNext={onNext} />}
      {clampedStep === 3 && <StepReady onNext={onNext} />}
    </OnboardingWrapper>
  );
}
