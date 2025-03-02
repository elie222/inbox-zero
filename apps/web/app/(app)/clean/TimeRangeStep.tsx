"use client";

import { useCallback } from "react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { TypographyH3 } from "@/components/Typography";
import { timeRangeOptions } from "@/app/(app)/clean/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";
import { useStep } from "@/app/(app)/clean/useStep";

export function TimeRangeStep() {
  const { onNext } = useStep();

  const [timeRange, setTimeRange] = useQueryState("timeRange", {
    defaultValue: "7",
  });

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

      <div className="mx-auto mt-6 flex max-w-lg flex-col gap-3">
        {timeRangeOptions.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            onClick={() => handleTimeRangeSelect(option.value)}
            className={cn(
              "relative w-full",
              option.recommended &&
                "ring-1 ring-inset ring-black dark:ring-white",
            )}
          >
            <span className="absolute inset-0 flex items-center justify-center">
              {option.label}
            </span>
            {option.recommended && (
              <span className="relative ml-auto">
                <Badge className="ml-2">Recommended</Badge>
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}
