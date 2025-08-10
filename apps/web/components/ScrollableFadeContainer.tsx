"use client";

import { cn } from "@/utils";
import type { ReactNode } from "react";

interface ScrollableFadeContainerProps {
  children: ReactNode;
  className?: string;
  maxHeight?: string;
  showTopFade?: boolean;
  showBottomFade?: boolean;
  fadeHeight?: string;
  fadeFromClass?: string;
}

export function ScrollableFadeContainer({
  children,
  className,
  maxHeight = "max-h-[500px]",
  showTopFade = true,
  showBottomFade = true,
  fadeHeight = "h-8",
  fadeFromClass = "from-background",
}: ScrollableFadeContainerProps) {
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

      <div className={cn("overflow-y-auto", maxHeight, className)}>
        {children}
      </div>

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
}
