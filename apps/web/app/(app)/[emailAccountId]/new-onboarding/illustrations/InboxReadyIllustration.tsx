"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Inbox, Check } from "lucide-react";

// Each step: [delay in ms, progress percentage to reach]
const loadingSteps = [
  { delay: 400, progress: 12 },
  { delay: 650, progress: 28 },
  { delay: 350, progress: 45 },
  { delay: 550, progress: 58 },
  { delay: 400, progress: 79 },
  { delay: 700, progress: 100 },
];

export function InboxReadyIllustration() {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];
    let cumulativeTime = 300;

    loadingSteps.forEach((step, index) => {
      cumulativeTime += step.delay;
      timeouts.push(
        setTimeout(() => {
          setProgress(step.progress);
          if (index === loadingSteps.length - 1) {
            setIsComplete(true);
          }
        }, cumulativeTime),
      );
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex h-[220px] w-[320px] items-center justify-center">
      {/* Progress ring */}
      <svg className="absolute h-[180px] w-[180px] -rotate-90">
        {/* Background circle */}
        <circle
          cx="90"
          cy="90"
          r="70"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <motion.circle
          cx="90"
          cy="90"
          r="70"
          fill="none"
          stroke="#22c55e"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </svg>

      {/* Center content */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{
          scale: isComplete ? 1.05 : 1,
          opacity: 1,
        }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl shadow-lg border border-gray-100 bg-white"
      >
        {isComplete ? (
          <Check className="h-7 w-7 text-green-500" strokeWidth={3} />
        ) : (
          <Inbox className="h-7 w-7 text-gray-400" />
        )}
      </motion.div>
    </div>
  );
}
