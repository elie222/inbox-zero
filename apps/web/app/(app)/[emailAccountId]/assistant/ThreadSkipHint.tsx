"use client";

import { Trans } from "@lingui/react/macro";
import { HoverCard } from "@/components/HoverCard";
import { cn } from "@/utils";

export function ThreadSkipHint({
  skippedThreadRuleNames,
  className,
}: {
  skippedThreadRuleNames: string[];
  className?: string;
}) {
  if (!skippedThreadRuleNames.length) return null;

  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      <Trans>
        Some rules were skipped because this email is part of a thread.
      </Trans>{" "}
      <HoverCard
        content={
          <div className="max-w-xs text-sm">
            <Trans>Skipped: {skippedThreadRuleNames.join(", ")}</Trans>
          </div>
        }
      >
        <button className="underline underline-offset-2" type="button">
          <Trans>View skipped rules</Trans>
        </button>
      </HoverCard>
    </div>
  );
}
