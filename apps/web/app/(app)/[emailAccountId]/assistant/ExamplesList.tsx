import { memo } from "react";
import { convertLabelsToDisplay } from "@/utils/mention";
import { SectionHeader } from "@/components/Typography";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getActionTypeColor } from "@/app/(app)/[emailAccountId]/assistant/constants";
import { Button } from "@/components/ui/button";
import { getExamplePrompts } from "@/app/(app)/[emailAccountId]/assistant/examples";

function PureExamples({
  examples,
  onSelect,
  provider,
  className = "mt-1.5 sm:h-[60vh] sm:max-h-[60vh]",
}: {
  examples: string[];
  onSelect: (example: string) => void;
  provider: string;
  className?: string;
}) {
  const examplePrompts = getExamplePrompts(provider, examples);

  return (
    <div>
      <SectionHeader className="text-xl">Examples</SectionHeader>

      <ScrollArea className={className}>
        <div className="grid grid-cols-1 gap-2">
          {examplePrompts.map((example) => {
            const { color } = getActionType(example);

            return (
              <Button
                key={example}
                variant="outline"
                onClick={() => onSelect(example)}
                className="h-auto w-full justify-start text-wrap py-2 text-left"
              >
                <div className="flex w-full items-start gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${color} mt-1.5 flex-shrink-0`}
                  />
                  <span className="flex-1">
                    {convertLabelsToDisplay(example)}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export const Examples = memo(PureExamples);

function getActionType(example: string): {
  type: string;
  color: string;
} {
  const lowerExample = example.toLowerCase();
  const color = getActionTypeColor(example);

  if (lowerExample.includes("forward")) {
    return { type: "forward", color };
  }
  if (lowerExample.includes("draft") || lowerExample.includes("reply")) {
    return { type: "reply", color };
  }
  if (lowerExample.includes("archive")) {
    return { type: "archive", color };
  }
  if (lowerExample.includes("spam") || lowerExample.includes("mark")) {
    return { type: "mark", color };
  }
  if (lowerExample.includes("label") || lowerExample.includes("categorize")) {
    return { type: "label", color };
  }

  return { type: "other", color };
}
