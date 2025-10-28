"use client";

import { useCallback } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { TypographyH3 } from "@/components/Typography";
import { timeRangeOptions } from "@/app/(app)/[emailAccountId]/clean/types";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";
import { Button } from "@/components/ui/button";

export function TimeRangeStep() {
  const { onNext, onPrevious } = useStep();

  const [_, setTimeRange] = useQueryState("timeRange", parseAsInteger);

  const handleTimeRangeSelect = useCallback(
    (selectedRange: string | number) => {
      const range = Number(selectedRange);
      setTimeRange(range);
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

      <div className="mt-6">
        <Button variant="outline" onClick={onPrevious}>
          Back
        </Button>
      </div>
    </div>
  );
}
