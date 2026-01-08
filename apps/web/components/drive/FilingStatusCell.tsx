"use client";

import { LoaderIcon, InfoIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";

export type FilingStatus = "filing" | "pending" | "skipped" | "error" | "filed";

interface FilingStatusCellProps {
  status: FilingStatus;
  skipReason?: string | null;
  error?: string | null;
  folderPath?: string | null;
  className?: string;
}

export function FilingStatusCell({
  status,
  skipReason,
  error,
  folderPath,
  className,
}: FilingStatusCellProps) {
  if (status === "filing" || status === "pending") {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
        <span>Analyzing...</span>
      </span>
    );
  }

  if (status === "skipped") {
    const tooltipContent = `Skipped — ${skipReason || "Doesn't match preferences"}`;
    return (
      <Tooltip content={tooltipContent}>
        <span className="flex items-center gap-1.5 text-muted-foreground italic">
          Skipped
          <InfoIcon className="size-3.5 flex-shrink-0" />
        </span>
      </Tooltip>
    );
  }

  if (status === "error") {
    const errorMessage = error || "Failed to file";
    return (
      <Tooltip content={errorMessage}>
        <span className="flex items-center gap-1.5 text-destructive">
          {errorMessage}
          <InfoIcon className="size-3.5 flex-shrink-0" />
        </span>
      </Tooltip>
    );
  }

  // status === "filed"
  const displayPath = folderPath || "—";
  return (
    <Tooltip content={displayPath}>
      <span
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground truncate",
          className,
        )}
      >
        <span className="truncate">{displayPath}</span>
        <InfoIcon className="size-3.5 flex-shrink-0" />
      </span>
    </Tooltip>
  );
}
