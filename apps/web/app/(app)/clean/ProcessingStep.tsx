"use client";

import { EmailTrainerAgent } from "./EmailTrainerAgent";
import type { EmailAction } from "./types";

interface ProcessingStepProps {
  action: EmailAction;
  timeRangeInDays: number;
  labelInstructions?: string;
  onReset: () => void;
}

export function ProcessingStep({
  action,
  timeRangeInDays,
  labelInstructions,
  onReset,
}: ProcessingStepProps) {
  return (
    <EmailTrainerAgent
      action={action}
      timeRangeInDays={timeRangeInDays}
      labelInstructions={labelInstructions}
      onReset={onReset}
    />
  );
}
