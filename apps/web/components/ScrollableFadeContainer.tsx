"use client";

import { cn } from "@/utils";
import { forwardRef, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScrollableFadeContainerProps {
  children: ReactNode;
  className?: string;
  height?: string;
  showTopFade?: boolean;
  showBottomFade?: boolean;
  fadeHeight?: string;
  fadeFromClass?: string;
}

export const ScrollableFadeContainer = forwardRef<
  HTMLDivElement,
  ScrollableFadeContainerProps
>(function ScrollableFadeContainer(
  {
    children,
    className,
    height = "h-[500px]",
    showTopFade = true,
    showBottomFade = true,
    fadeHeight = "h-8",
    fadeFromClass = "from-background",
  },
  ref,
) {
  return (
    <div className="relative">
      {showTopFade && (
        <div
          className={cn(
            "absolute top-0 left-0 right-0 bg-gradient-to-b to-transparent z-10 pointer-events-none",
            fadeHeight,
            fadeFromClass,
          )}
        />
      )}

      <ScrollArea className={cn(height, "pr-1.5")}>
        <div ref={ref} className={className}>
          {children}
        </div>
      </ScrollArea>

      {showBottomFade && (
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-gradient-to-t to-transparent z-10 pointer-events-none",
            fadeHeight,
            fadeFromClass,
          )}
        />
      )}
    </div>
  );
});
