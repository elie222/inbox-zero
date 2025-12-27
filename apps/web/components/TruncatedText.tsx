"use client";

import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";

export function TruncatedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <ShadcnTooltip>
        <TooltipTrigger asChild>
          <span className={cn("block truncate", className)}>{text}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs whitespace-pre-wrap break-words">{text}</p>
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
}
