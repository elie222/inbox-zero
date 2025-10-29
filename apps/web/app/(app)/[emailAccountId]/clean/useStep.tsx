import { useCallback } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { CleanStep } from "@/app/(app)/[emailAccountId]/clean/types";

export function useStep() {
  const [step, setStep] = useQueryState(
    "step",
    parseAsInteger
      .withDefault(CleanStep.INTRO)
      .withOptions({ history: "push", shallow: false }),
  );

  const onNext = useCallback(() => {
    setStep((prev) => (prev ?? CleanStep.INTRO) + 1);
  }, [setStep]);

  const onPrevious = useCallback(() => {
    setStep((prev) => Math.max(CleanStep.INTRO, (prev ?? CleanStep.INTRO) - 1));
  }, [setStep]);

  return {
    step,
    setStep,
    onNext,
    onPrevious,
  };
}
