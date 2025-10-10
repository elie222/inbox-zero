"use client";

import { useState } from "react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipProps {
  children: React.ReactElement<any>;
  content?: string;
  contentComponent?: React.ReactNode;
  hide?: boolean;
}

export const Tooltip = ({
  children,
  content,
  contentComponent,
  hide,
}: TooltipProps) => {
  // Make tooltip work on mobile with a click
  const [isOpen, setIsOpen] = useState(false);

  if (hide) return children;

  return (
    <TooltipProvider delayDuration={200}>
      <ShadcnTooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild onClick={() => setIsOpen(!isOpen)}>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          {contentComponent || <p className="max-w-xs">{content}</p>}
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
};
