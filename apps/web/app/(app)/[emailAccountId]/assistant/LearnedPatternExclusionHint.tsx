"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import { cn } from "@/utils";
import type { RuleSelectionMetadata } from "@/utils/ai/choose-rule/types";

export function LearnedPatternExclusionHint({
  learnedPatternExcludedRules,
  className,
}: {
  learnedPatternExcludedRules: RuleSelectionMetadata["learnedPatternExcludedRules"];
  className?: string;
}) {
  if (!learnedPatternExcludedRules.length) return null;

  const uniqueGroups = getUniqueGroups(learnedPatternExcludedRules);

  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      Some rules were excluded by learned patterns.{" "}
      <Dialog>
        <DialogTrigger asChild>
          <button className="underline underline-offset-2" type="button">
            View exclusions
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Excluded learned patterns</DialogTitle>
            <DialogDescription>
              These learned patterns prevented matching rules from being
              considered for this email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {uniqueGroups.map((group) => (
              <div key={group.groupId} className="space-y-3">
                <div className="space-y-1">
                  <div className="font-medium text-foreground">
                    {group.ruleName}
                  </div>
                  <div>
                    Excluded by {group.itemType.toLowerCase()}:{" "}
                    <span className="font-medium text-foreground">
                      {group.itemValue}
                    </span>
                  </div>
                </div>
                <ViewLearnedPatterns groupId={group.groupId} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getUniqueGroups(
  learnedPatternExcludedRules: RuleSelectionMetadata["learnedPatternExcludedRules"],
) {
  const groups = new Map<
    string,
    RuleSelectionMetadata["learnedPatternExcludedRules"][number]
  >();

  for (const exclusion of learnedPatternExcludedRules) {
    if (!groups.has(exclusion.groupId)) {
      groups.set(exclusion.groupId, exclusion);
    }
  }

  return Array.from(groups.values());
}
