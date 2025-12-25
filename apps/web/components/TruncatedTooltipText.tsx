"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

/**
 * A component that truncates text to a single line and shows the full text
 * in a tooltip on hover if the text length exceeds maxLength.
 */
export function TruncatedTooltipText({
  text,
  maxLength,
  className,
}: {
  text: string;
  maxLength: number;
  className?: string;
}) {
  const isTooLong = text.length > maxLength;

  const content = <div className={cn("truncate", className)}>{text}</div>;

  if (!isTooLong) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-[400px] whitespace-pre-wrap break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
