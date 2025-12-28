"use client";

import { cn } from "@/utils";

interface SlideNavigationProps {
  totalSlides: number;
  currentSlide: number;
  onSlideChange: (index: number) => void;
}

export function SlideNavigation({
  totalSlides,
  currentSlide,
  onSlideChange,
}: SlideNavigationProps) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
      {Array.from({ length: totalSlides }).map((_, index) => (
        <button
          type="button"
          key={index}
          onClick={() => onSlideChange(index)}
          className={cn(
            "h-2.5 w-2.5 rounded-full transition-all duration-200",
            currentSlide === index
              ? "bg-white scale-125"
              : "bg-white/30 hover:bg-white/50",
          )}
          aria-label={`Go to slide ${index + 1}`}
        />
      ))}
    </div>
  );
}
