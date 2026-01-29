"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function MeetingBriefsIllustration() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timings = [
      875, // Stage 1: Email card slides in with header
      625, // Stage 2: Guest name appears
      500, // Stage 3: Bullets appear
      3750, // Pause before reset
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
      }, timings[currentStage] || 875);
    };

    advanceStage();

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <div className="absolute inset-0 flex items-center justify-center px-4 py-4">
        <AnimatePresence mode="wait">
          {stage >= 1 && (
            <motion.div
              key="email"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full max-w-[260px] rounded-lg bg-white shadow-lg dark:bg-slate-800"
            >
              {/* Email header */}
              <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                <div className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                  Briefing for{" "}
                  <span className="text-blue-600 dark:text-blue-400">
                    Product Review
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  Starting at{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    2:00 PM
                  </span>
                </div>
              </div>

              {/* Email body */}
              <div className="px-3">
                <motion.div
                  className="overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: stage >= 2 ? "auto" : 0,
                    opacity: stage >= 2 ? 1 : 0,
                  }}
                  transition={{ duration: 0.31, ease: "easeOut" }}
                >
                  <div className="py-2 text-[10px] font-semibold text-gray-800 dark:text-gray-200">
                    John Smith{" "}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      (john@acme.com)
                    </span>
                  </div>
                </motion.div>
                <motion.div
                  className="space-y-0.5 overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: stage >= 3 ? "auto" : 0,
                    opacity: stage >= 3 ? 1 : 0,
                  }}
                  transition={{ duration: 0.31, ease: "easeOut" }}
                >
                  <div className="text-[9px] text-gray-600 dark:text-gray-400">
                    <span className="text-gray-400">-</span> CEO of Acme Corp,
                    joined 2019
                  </div>
                  <div className="text-[9px] text-gray-600 dark:text-gray-400">
                    <span className="text-gray-400">-</span> Last met 3 weeks
                    ago
                  </div>
                  <div className="pb-2 text-[9px] text-gray-600 dark:text-gray-400">
                    <span className="text-gray-400">-</span> Discussed
                    enterprise pricing
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
