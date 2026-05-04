"use client";

import { useCallback, useRef } from "react";

const VIDEO_PROGRESS_MILESTONES = [25, 50, 75] as const;

export function useVideoProgressMilestones({
  onProgress,
}: {
  onProgress?: (progressPercent: number) => void;
}) {
  const trackedProgressMilestones = useRef(new Set<number>());

  const resetProgressMilestones = useCallback(() => {
    trackedProgressMilestones.current.clear();
  }, []);

  const trackProgressMilestones = useCallback(
    (progressPercent: number) => {
      if (
        trackedProgressMilestones.current.size ===
        VIDEO_PROGRESS_MILESTONES.length
      ) {
        return;
      }

      for (const milestone of VIDEO_PROGRESS_MILESTONES) {
        if (
          progressPercent >= milestone &&
          !trackedProgressMilestones.current.has(milestone)
        ) {
          trackedProgressMilestones.current.add(milestone);
          onProgress?.(milestone);
        }
      }
    },
    [onProgress],
  );

  return { resetProgressMilestones, trackProgressMilestones };
}
