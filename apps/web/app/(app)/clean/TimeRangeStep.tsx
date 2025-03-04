"use client";

import { useCallback } from "react";
import { useQueryState } from "nuqs";
import { TypographyH3 } from "@/components/Typography";
import { timeRangeOptions } from "@/app/(app)/clean/types";
import { useStep } from "@/app/(app)/clean/useStep";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";

export function TimeRangeStep() {
  const { onNext } = useStep();

  const [_, setTimeRange] = useQueryState("timeRange", { defaultValue: "7" });

  const handleTimeRangeSelect = useCallback(
    (selectedRange: string) => {
      setTimeRange(selectedRange);
      onNext();
    },
    [setTimeRange, onNext],
  );

  return (
    <div className="text-center">
      <TypographyH3>Which emails would you like to process?</TypographyH3>

      <ButtonListSurvey
        className="mt-6"
        options={timeRangeOptions}
        onClick={handleTimeRangeSelect}
      />
    </div>
  );
}
