"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ProgressBar } from "@tremor/react";
import { cn } from "@/utils";

interface ProgressPanelProps {
  totalItems: number;
  remainingItems: number;
  inProgressText: string;
  completedText: string;
  itemLabel?: string;
}

export function ProgressPanel({
  totalItems,
  remainingItems,
  inProgressText,
  completedText,
  itemLabel = "items",
}: ProgressPanelProps) {
  const totalProcessed = totalItems - remainingItems;
  const progress = (totalProcessed / totalItems) * 100;
  const isCompleted = progress === 100;

  if (!totalItems) return null;

  return (
    <div className="px-4 py-2">
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
              {isCompleted ? completedText : inProgressText}
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
