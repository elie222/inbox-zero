"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { ViewGroup } from "@/app/(app)/automation/group/ViewGroup";

export function LearnedPatterns({ groupId }: { groupId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="overflow-hidden rounded-lg border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between bg-background p-4 hover:bg-muted">
        <div className="flex items-center gap-2">
          <BrainIcon size={16} className="text-muted-foreground" />
          <span className="font-medium">
            Learned Patterns (previously known as Groups)
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* <div className="flex items-center space-x-1.5 border-r pr-4">
            <TooltipExplanation text="Automatically detect and add new matching patterns from incoming emails." />
            <Toggle
              name="auto-learn"
              label="Auto-learn"
              enabled={autoLearn}
              onChange={(enabled) => setAutoLearn(enabled)}
            />
          </div> */}

          <ChevronDownIcon
            size={16}
            className={`transform transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ViewGroup groupId={groupId} />
      </CollapsibleContent>
    </Collapsible>
  );
}
