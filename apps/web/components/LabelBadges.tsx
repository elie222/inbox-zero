"use client";

import type { CSSProperties } from "react";
import { Tooltip } from "@/components/Tooltip";
import type { EmailMessageCellLabel } from "@/components/EmailMessageCellLabels";
import { cn } from "@/utils";

const MAX_VISIBLE_LABELS = 2;

// Match Gmail/Outlook: labels without an assigned color are gray
const FALLBACK_COLOR = "#9CA3AF";

// Gmail-style chip: soft tint of the label color as background, with the
// color mixed toward the theme foreground for readable text in both modes
function chipStyle(label: EmailMessageCellLabel): CSSProperties {
  const color = label.color?.backgroundColor || FALLBACK_COLOR;
  return {
    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
    color: `color-mix(in srgb, ${color} 55%, hsl(var(--foreground)))`,
  };
}

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
        <span
          key={label.id}
          className="inline-flex max-w-[140px] items-center rounded-md px-1.5 py-0.5 text-xs font-medium"
          style={chipStyle(label)}
        >
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {overflowLabels.length > 0 && (
        <Tooltip content={overflowLabels.map((l) => l.name).join(", ")}>
          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            +{overflowLabels.length}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
