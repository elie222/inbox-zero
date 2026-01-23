"use client";

import { TrendingUp, Sparkles, Cpu } from "lucide-react";
import { cn } from "@/utils";

interface BadgeProps {
  className?: string;
}

export function PopularBadge({ className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white",
        className,
      )}
    >
      <TrendingUp className="h-3 w-3" />
      <span>Popular</span>
    </span>
  );
}

export function NewBadge({ className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500 px-2 py-0.5 text-xs font-medium text-white",
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      <span>New</span>
    </span>
  );
}

export function AIBadge({ className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white",
        className,
      )}
    >
      <Cpu className="h-3 w-3" />
      <span>AI</span>
    </span>
  );
}
