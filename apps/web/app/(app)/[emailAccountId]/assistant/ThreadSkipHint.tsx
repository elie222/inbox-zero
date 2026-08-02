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

  const count = skippedThreadRuleNames.length;

  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      {count} {count === 1 ? "rule was" : "rules were"} never evaluated: this
      email is a reply, and {count === 1 ? "it only runs" : "they only run"} on
      the first message of a thread.{" "}
      <HoverCard
        content={
          <div className="max-w-xs space-y-1.5 text-sm">
            <div>Skipped: {skippedThreadRuleNames.join(", ")}</div>
            <div className="text-muted-foreground">
              To let a rule apply to replies too, turn on &ldquo;Apply to
              threads&rdquo; under Advanced options in that rule.
            </div>
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
