"use client";

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
      Some rules were skipped because this email is part of a thread.{" "}
      <HoverCard
        content={
          <div className="max-w-xs text-sm">
            Skipped: {skippedThreadRuleNames.join(", ")}
          </div>
        }
      >
        <button className="underline underline-offset-2" type="button">
          View skipped rules
        </button>
      </HoverCard>
    </div>
  );
}
