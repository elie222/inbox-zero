"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function FollowUpRemindersIllustration() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timings = [
      800, // Stage 1: Card slides in
      600, // Stage 2: "You replied" appears
      500, // Stage 3: "1 day ago"
      500, // Stage 4: "2 days ago"
      500, // Stage 5: "3 days ago"
      400, // Stage 6: Follow up label appears
      2000, // Pause before reset
    ];

    let timeout: NodeJS.Timeout;
    let currentStage = 0;

    const advanceStage = () => {
      timeout = setTimeout(() => {
        currentStage++;
        if (currentStage > timings.length) {
          currentStage = 0;
          setStage(0);
        } else {
          setStage(currentStage);
        }
        advanceStage();
      }, timings[currentStage] || 800);
    };

    advanceStage();

    return () => clearTimeout(timeout);
  }, []);

  const daysText =
    stage >= 5 ? "3 days ago" : stage >= 4 ? "2 days ago" : "1 day ago";

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <div className="absolute inset-0 flex items-center justify-center px-6 py-6">
        <AnimatePresence mode="wait">
          {stage >= 1 && (
            <motion.div
              key="card"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full max-w-[280px] rounded-lg bg-white p-3 shadow-md dark:bg-slate-800"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-semibold text-pink-600 dark:bg-pink-900/50 dark:text-pink-300">
                  SM
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                      Sarah Miller
                    </span>
                    <AnimatePresence>
                      {stage >= 6 && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-800/50 dark:text-amber-300"
                        >
                          Follow up
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                    Meeting follow-up
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                Thanks for your time today. I wanted to follow up on...
              </div>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{
                  height: stage >= 2 ? "auto" : 0,
                  opacity: stage >= 2 ? 1 : 0,
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 flex items-center gap-1.5 border-t border-gray-100 pt-2 dark:border-gray-700">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    ↩ You replied
                    {stage >= 3 && (
                      <motion.span
                        key={daysText}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {" "}
                        · {daysText}
                      </motion.span>
                    )}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
