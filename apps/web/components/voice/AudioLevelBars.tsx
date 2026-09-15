"use client";

import { cn } from "@/utils";

export function AudioLevelBars({
  level,
  active,
}: {
  level: number;
  active: boolean;
}) {
  const heights = [0.35, 0.7, 1, 0.55, 0.4].map((weight, index) =>
    active
      ? Math.max(0.2, Math.min(1, level * weight + (index % 2 ? 0.08 : 0)))
      : 0.2,
  );

  return (
    <div
      aria-hidden
      className="flex h-5 items-end gap-0.5"
      data-testid="voice-level"
    >
      {heights.map((height, index) => (
        <span
          key={index}
          className={cn(
            "w-0.5 rounded-full bg-violet-400 transition-[height] duration-75",
            !active && "opacity-50",
          )}
          style={{ height: `${Math.round(height * 20)}px` }}
        />
      ))}
    </div>
  );
}
