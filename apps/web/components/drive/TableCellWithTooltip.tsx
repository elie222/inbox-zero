"use client";

import { InfoIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";

interface TableCellWithTooltipProps {
  text: string;
  tooltipContent: string;
  className?: string;
  truncate?: boolean;
}

export function TableCellWithTooltip({
  text,
  tooltipContent,
  className,
  truncate = true,
}: TableCellWithTooltipProps) {
  return (
    <Tooltip content={tooltipContent}>
      <span
        className={cn(
          "flex items-center gap-1.5",
          truncate && "truncate",
          className,
        )}
      >
        {truncate ? (
          <>
            <span className="truncate">{text}</span>
            <InfoIcon className="size-3.5 flex-shrink-0" />
          </>
        ) : (
          <>
            {text}
            <InfoIcon className="size-3.5 flex-shrink-0" />
          </>
        )}
      </span>
    </Tooltip>
  );
}
