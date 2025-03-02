import { Button } from "@/components/ui/button";
import { TypographyH3 } from "@/components/Typography";
import { SectionDescription } from "@/components/Typography";
import { timeRangeOptions } from "@/app/(app)/clean/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";

interface TimeRangeStepProps {
  timeRange: string;
  onTimeRangeSelect: (timeRange: string) => void;
}

export function TimeRangeStep({
  timeRange,
  onTimeRangeSelect,
}: TimeRangeStepProps) {
  return (
    <div className="text-center">
      <TypographyH3>Which emails would you like to process?</TypographyH3>

      <div className="mx-auto mt-6 flex max-w-lg flex-col gap-3">
        {timeRangeOptions.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            onClick={() => onTimeRangeSelect(option.value)}
            className={cn(
              "relative w-full",
              option.recommended &&
                "ring-1 ring-inset ring-black ring-border dark:ring-white",
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
