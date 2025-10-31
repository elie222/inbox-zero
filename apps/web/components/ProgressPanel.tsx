"use client";

import { AnimatePresence, motion } from "motion/react";
import { ProgressBar } from "@tremor/react";
import { cn } from "@/utils";
import { LoadingMiniSpinner } from "@/components/Loading";

export function ProgressPanel({
  totalItems,
  remainingItems,
  inProgressText,
  completedText,
  itemLabel,
}: {
  totalItems: number;
  remainingItems: number;
  inProgressText: string;
  completedText: string;
  itemLabel: string;
}) {
  const totalProcessed = totalItems - remainingItems;
  const progress = (totalProcessed / totalItems) * 100;
  const isCompleted = progress === 100;

  if (!totalItems) return null;

  return (
    <div className="py-2">
      <AnimatePresence mode="wait">
        <motion.div
          key="progress"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ProgressBar
            value={progress}
            className="w-full"
            color={isCompleted ? "green" : "blue"}
          />
          <p className="mt-2 flex justify-between text-sm" aria-live="polite">
            <span
              className={cn(
                "text-muted-foreground",
                isCompleted ? "text-green-500" : "",
              )}
            >
              {isCompleted ? (
                completedText
              ) : (
                <div className="flex items-center gap-1">
                  <LoadingMiniSpinner />
                  <span>{inProgressText}</span>
                </div>
              )}
            </span>
            <span>
              {totalProcessed} of {totalItems} {itemLabel} processed
            </span>
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
