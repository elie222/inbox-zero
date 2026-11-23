"use client";

import { useRef, useState } from "react";
import {
  ShortcutTooltipContent,
  type ShortcutTooltipItem,
} from "@/components/ShortcutTooltipContent";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipProps {
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  children: React.ReactElement<any>;
  content?: string;
  contentComponent?: React.ReactNode;
  hide?: boolean;
  shortcuts?: readonly ShortcutTooltipItem[];
  showShortcutLabels?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}

export const Tooltip = ({
  children,
  content,
  contentComponent,
  shortcuts,
  showShortcutLabels,
  hide,
  side,
}: TooltipProps) => {
  const [isOpen, setIsOpen] = useState(false);
  // Touch has no hover, so tapping something that only carries information
  // (a badge, a date) toggles its tooltip. Tapping a control runs the control
  // instead, and a mouse click never opens one.
  const isTouch = useRef(false);

  if (hide) return children;

  return (
    <ShadcnTooltip open={isOpen} onOpenChange={setIsOpen}>
      <TooltipTrigger
        asChild
        onPointerDown={(event) => {
          isTouch.current = event.pointerType === "touch";
        }}
        onClick={(event) => {
          if (isTouch.current && !event.currentTarget.matches(CONTROLS))
            setIsOpen((open) => !open);
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>
        {contentComponent ||
          (shortcuts ? (
            <ShortcutTooltipContent
              shortcuts={shortcuts}
              showLabels={showShortcutLabels}
            />
          ) : (
            <p className="max-w-xs">{content}</p>
          ))}
      </TooltipContent>
    </ShadcnTooltip>
  );
};

const CONTROLS =
  'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="tab"]';
