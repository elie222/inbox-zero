"use client";

import uniqBy from "lodash/uniqBy";
import { HoverCard } from "@/components/HoverCard";
import { LearnedPatternsDialog } from "@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns";
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

  const uniqueGroups = uniqBy(learnedPatternExcludedRules, (e) => e.groupId);

  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      Some rules were excluded by learned patterns.{" "}
      <HoverCard
        className="w-96"
        content={
          <div className="space-y-3 text-sm">
            {uniqueGroups.map((group) => (
              <div key={group.groupId} className="space-y-2">
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
                <LearnedPatternsDialog
                  ruleId={group.ruleId}
                  groupId={group.groupId}
                />
              </div>
            ))}
          </div>
        }
      >
        <button className="underline underline-offset-2" type="button">
          View exclusions
        </button>
      </HoverCard>
    </div>
  );
}
