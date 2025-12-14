"use client";

import type React from "react";
import { cn } from "@/utils";

export type TextShimmerProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
};

/**
 * TextShimmer - A CSS-only animated shimmer effect for text
 * Creates a gradient animation that sweeps across the text
 */
export function TextShimmer({
  children,
  as: Component = "p",
  className,
  duration = 3,
}: TextShimmerProps) {
  return (
    <Component
      className={cn(
        "inline-block bg-clip-text text-transparent",
        "bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground",
        "bg-[length:200%_100%]",
        className,
      )}
      style={{
        animation: `shimmer ${duration}s linear infinite`,
      }}
    >
      {children}
    </Component>
  );
}

/**
 * TextShimmerOnce - Shimmer effect that runs once (not infinite)
 * Good for loading states that should stop
 */
export function TextShimmerOnce({
  children,
  as: Component = "p",
  className,
  duration = 1.5,
}: TextShimmerProps) {
  return (
    <Component
      className={cn(
        "inline-block bg-clip-text text-transparent",
        "bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground",
        "bg-[length:200%_100%]",
        className,
      )}
      style={{
        animation: `shimmer ${duration}s ease-out forwards`,
      }}
    >
      {children}
    </Component>
  );
}

/**
 * GradientText - Static gradient text without animation
 * Useful for branded or highlighted text
 */
export function GradientText({
  children,
  as: Component = "span",
  className,
  gradient = "from-primary via-blue-500 to-purple-600",
}: {
  children: React.ReactNode;
  as?: React.ElementType;
  className?: string;
  gradient?: string;
}) {
  return (
    <Component
      className={cn(
        "inline-block bg-clip-text text-transparent bg-gradient-to-r",
        gradient,
        className,
      )}
    >
      {children}
    </Component>
  );
}
