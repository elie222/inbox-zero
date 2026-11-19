"use client";

import { Plural, Trans } from "@lingui/react/macro";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/utils";

export function ActivityGroup({
  stepCount,
  isActive,
  children,
}: {
  stepCount: number;
  isActive: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="not-prose">
      <CollapsibleTrigger
        data-testid="chat-activity-group"
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        {isActive ? (
          <span className="animate-pulse">
            <Trans>Working...</Trans>
          </span>
        ) : (
          <span>
            <Plural
              value={stepCount}
              one="Worked through # step"
              other="Worked through # steps"
            />
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-2 border-l pl-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
