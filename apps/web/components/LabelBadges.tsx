"use client";

import { Tooltip } from "@/components/Tooltip";
import { Badge } from "@/components/ui/badge";
import type { EmailMessageCellLabel } from "@/components/EmailMessageCellLabels";
import { cn } from "@/utils";

const MAX_VISIBLE_LABELS = 2;

export function LabelBadges({
  labels,
  className,
}: {
  labels: EmailMessageCellLabel[];
  className?: string;
}) {
  if (labels.length === 0) return null;

  const visibleLabels = labels.slice(0, MAX_VISIBLE_LABELS);
  const overflowLabels = labels.slice(MAX_VISIBLE_LABELS);

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {visibleLabels.map((label) => (
        <Badge
          variant="outline"
          key={label.id}
          className="max-w-[140px] font-normal text-muted-foreground"
        >
          <span
            className="mr-1 size-2 shrink-0 rounded-full"
            // Match Gmail/Outlook: labels without an assigned color are gray
            style={{
              backgroundColor: label.color?.backgroundColor || "#9CA3AF",
            }}
          />
          <span className="truncate">{label.name}</span>
        </Badge>
      ))}
      {overflowLabels.length > 0 && (
        <Tooltip content={overflowLabels.map((l) => l.name).join(", ")}>
          <span>
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              +{overflowLabels.length}
            </Badge>
          </span>
        </Tooltip>
      )}
    </div>
  );
}
