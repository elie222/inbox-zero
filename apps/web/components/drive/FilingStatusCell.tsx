"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { LoaderIcon, InfoIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";

export type FilingStatus = "filing" | "pending" | "skipped" | "error" | "filed";

interface FilingStatusCellProps {
  className?: string;
  error?: string | null;
  folderPath?: string | null;
  skipReason?: string | null;
  status: FilingStatus;
}

export function FilingStatusCell({
  status,
  skipReason,
  error,
  folderPath,
  className,
}: FilingStatusCellProps) {
  const { t } = useLingui();

  if (status === "filing" || status === "pending") {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
        <span>
          <Trans>Analyzing...</Trans>
        </span>
      </span>
    );
  }

  if (status === "skipped") {
    const reason = skipReason || t`Doesn't match preferences`;
    const tooltipContent = t`Skipped — ${reason}`;
    return (
      <Tooltip content={tooltipContent}>
        <span className="flex items-center gap-1.5 text-muted-foreground italic">
          <Trans>Skipped</Trans>
          <InfoIcon className="size-3.5 flex-shrink-0" />
        </span>
      </Tooltip>
    );
  }

  if (status === "error") {
    const errorMessage = error || t`Failed to file`;
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
    <span
      className={cn(
        "flex items-center text-muted-foreground truncate",
        className,
      )}
    >
      <span className="truncate">{displayPath}</span>
    </span>
  );
}
