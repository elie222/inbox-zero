import { Button } from "@/components/ui/button";
import { TypographyH3 } from "@/components/Typography";
import { SectionDescription } from "@/components/Typography";
import { timeRangeOptions } from "@/app/(app)/clean/types";

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
      <TypographyH3 className="mb-4">
        How old should emails be before we process them?
      </TypographyH3>

      <SectionDescription className="mx-auto mb-6 max-w-prose">
        We recommend only processing emails that are at least a week old.
      </SectionDescription>

      <div className="mx-auto flex max-w-md flex-col gap-3">
        {timeRangeOptions.map((option) => (
          <Button
            key={option.value}
            variant={timeRange === option.value ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => onTimeRangeSelect(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
