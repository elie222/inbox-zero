import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAtomValue } from "jotai";
import { ProgressBar } from "@tremor/react";
import { queueAtoms, resetTotalThreads } from "@/store/archive-queue";
import { cn } from "@/utils";

export const ArchiveProgress = () => {
  const { totalThreads, activeThreadIds } = useAtomValue(queueAtoms.archive);

  // Make sure activeThreadIds is an object as this was causing an error.
  const threadsRemaining = Object.values(activeThreadIds || {}).filter(
    Boolean,
  ).length;
  const totalArchived = totalThreads - threadsRemaining;
  const progress = (totalArchived / totalThreads) * 100;
  const isCompleted = progress === 100;

  useEffect(() => {
    if (isCompleted) {
      setTimeout(() => {
        resetTotalThreads("archive");
      }, 5_000);
    }
  }, [isCompleted]);

  if (!totalThreads) return null;

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
              {isCompleted ? "Archiving complete!" : "Archiving emails..."}
            </span>
            <span>
              {totalArchived} of {totalThreads} emails archived
            </span>
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
