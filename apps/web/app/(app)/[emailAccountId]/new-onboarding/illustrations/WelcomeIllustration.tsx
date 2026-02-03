"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Sparkles, Check, Inbox } from "lucide-react";

const emails = [
  { id: 1, delay: 0, startX: -120, startY: -80 },
  { id: 2, delay: 0.15, startX: 100, startY: -60 },
  { id: 3, delay: 0.3, startX: -80, startY: 60 },
  { id: 4, delay: 0.45, startX: 110, startY: 40 },
  { id: 5, delay: 0.6, startX: -100, startY: -20 },
  { id: 6, delay: 0.75, startX: 90, startY: -100 },
];

type AnimationPhase = "gathering" | "processing" | "complete" | "pause";

export function WelcomeIllustration() {
  const [phase, setPhase] = useState<AnimationPhase>("gathering");
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    setPhase("gathering");

    const timeouts: NodeJS.Timeout[] = [];

    timeouts.push(setTimeout(() => setPhase("processing"), 1200));
    timeouts.push(setTimeout(() => setPhase("complete"), 2400));
    timeouts.push(setTimeout(() => setPhase("pause"), 4000));
    timeouts.push(setTimeout(() => setAnimationKey((prev) => prev + 1), 5000));

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const showEmails = phase === "gathering";
  const isProcessing = phase === "processing";
  const isComplete = phase === "complete" || phase === "pause";

  return (
    <div className="relative flex h-[240px] w-[320px] items-center justify-center">
      <AnimatePresence>
        {showEmails &&
          emails.map((email) => (
            <motion.div
              key={`${animationKey}-${email.id}`}
              initial={{
                x: email.startX,
                y: email.startY,
                opacity: 0,
                scale: 0.6,
              }}
              animate={{
                x: 0,
                y: 0,
                opacity: 1,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.3,
              }}
              transition={{
                delay: email.delay,
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="absolute"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-md">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
            </motion.div>
          ))}
      </AnimatePresence>

      <motion.div
        animate={{
          scale: isProcessing ? [1, 1.1, 1] : isComplete ? 1.05 : 1,
        }}
        transition={{
          duration: isProcessing ? 0.6 : 0.4,
          repeat: isProcessing ? 2 : 0,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-white border-2 border-gray-100 shadow-xl"
      >
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Check className="h-10 w-10 text-green-500" strokeWidth={2.5} />
            </motion.div>
          ) : isProcessing ? (
            <motion.div
              key="processing"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            >
              <Sparkles className="h-10 w-10 text-blue-500" />
            </motion.div>
          ) : (
            <motion.div key="inbox">
              <Inbox className="h-10 w-10 text-gray-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {isProcessing &&
          [0, 1, 2].map((i) => (
            <motion.div
              key={`ring-${i}`}
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{ scale: 2.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.2,
                delay: i * 0.4,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeOut",
              }}
              className="absolute h-20 w-20 rounded-2xl border-2 border-blue-400"
            />
          ))}
      </AnimatePresence>

      <AnimatePresence>
        {isComplete && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="absolute -bottom-2 flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 border border-green-200"
          >
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-700">
              Inbox Zero
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
