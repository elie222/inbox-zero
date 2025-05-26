"use client";

import { useState } from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ViewGroup } from "@/app/(app)/[emailAccountId]/assistant/group/ViewGroup";

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
          <span className="font-medium">Learned Patterns</span>
        </div>

        <div className="flex items-center gap-4">
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
