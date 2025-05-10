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
    setStep(step + 1);
  }, [step, setStep]);

  return {
    step,
    setStep,
    onNext,
  };
}
