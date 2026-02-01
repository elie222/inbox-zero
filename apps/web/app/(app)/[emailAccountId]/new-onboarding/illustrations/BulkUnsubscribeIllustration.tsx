"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  CircleCheck,
  Tag,
  Newspaper,
  Megaphone,
  Calendar,
  Bell,
  type LucideIcon,
} from "lucide-react";

const senders: {
  id: number;
  name: string;
  color: string;
  icon: LucideIcon;
  rotate: number;
  emailCount: number;
}[] = [
  {
    id: 1,
    name: "Daily Deals",
    color: "bg-red-100 text-red-600",
    icon: Tag,
    rotate: -3,
    emailCount: 127,
  },
  {
    id: 2,
    name: "Newsletter",
    color: "bg-orange-100 text-orange-600",
    icon: Newspaper,
    rotate: 2,
    emailCount: 84,
  },
  {
    id: 3,
    name: "Promo Alert",
    color: "bg-yellow-100 text-yellow-600",
    icon: Megaphone,
    rotate: -1.5,
    emailCount: 56,
  },
  {
    id: 4,
    name: "Weekly Digest",
    color: "bg-purple-100 text-purple-600",
    icon: Calendar,
    rotate: 2.5,
    emailCount: 43,
  },
  {
    id: 5,
    name: "Updates",
    color: "bg-pink-100 text-pink-600",
    icon: Bell,
    rotate: -2,
    emailCount: 31,
  },
];

export function BulkUnsubscribeIllustration() {
  const [stage, setStage] = useState(0);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];

    timeouts.push(setTimeout(() => setStage(1), 800));
    timeouts.push(setTimeout(() => setStage(2), 1100));
    timeouts.push(setTimeout(() => setStage(3), 1400));
    timeouts.push(setTimeout(() => setStage(4), 1700));
    timeouts.push(setTimeout(() => setStage(5), 2000));
    timeouts.push(
      setTimeout(() => {
        setStage(0);
        setKey((k) => k + 1);
      }, 4500),
    );

    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const archivedEmailCount = senders
    .slice(0, stage)
    .reduce((sum, sender) => sum + sender.emailCount, 0);

  return (
    <div className="relative flex h-[200px] w-[420px] items-center justify-center gap-6">
      {/* Inbox card */}
      <div className="relative z-10 flex h-[160px] w-[150px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <div className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            Inbox
          </div>
        </div>
        <div className="relative flex-1 p-2">
          {/* Static senders (not animating out) */}
          {senders.map((email, index) => {
            const isArchived = index < stage;
            if (isArchived) return null;

            return (
              <motion.div
                key={`static-${key}-${email.id}`}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{
                  opacity: 1,
                  y: index * 10,
                  scale: 1,
                  rotate: email.rotate,
                }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.06,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="absolute left-2 right-2 flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 shadow-sm dark:border-gray-600 dark:bg-slate-700"
                style={{ zIndex: senders.length - index }}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${email.color}`}
                >
                  <email.icon className="h-2.5 w-2.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[9px] font-medium text-gray-900 dark:text-gray-100">
                    {email.name}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* All clean state */}
          {stage === 5 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <CircleCheck className="h-6 w-6 text-gray-400" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Animating senders layer - renders above cards */}
      <AnimatePresence>
        {senders.map((email, index) => {
          const isAnimatingOut = index === stage - 1 && stage > 0;
          if (!isAnimatingOut) return null;

          return (
            <motion.div
              key={`flying-${key}-${email.id}`}
              initial={{
                opacity: 1,
                x: -135,
                y: index * 10 - 50,
                scale: 1,
                rotate: email.rotate,
              }}
              animate={{
                opacity: 0,
                x: 50,
                y: 0,
                scale: 0.6,
                rotate: 0,
              }}
              transition={{
                duration: 0.4,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="absolute left-1/2 top-1/2 z-20 flex w-[126px] items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 shadow-sm dark:border-gray-600 dark:bg-slate-700"
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${email.color}`}
              >
                <email.icon className="h-2.5 w-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[9px] font-medium text-gray-900 dark:text-gray-100">
                  {email.name}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Arrow */}
      <motion.div
        initial={{ opacity: 0.3 }}
        animate={{ opacity: stage > 0 ? 1 : 0.3 }}
        className="z-10 flex items-center"
      >
        <svg
          className="h-4 w-6 text-gray-300"
          viewBox="0 0 24 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M0 8h20M14 2l6 6-6 6" />
        </svg>
      </motion.div>

      {/* Archive card */}
      <div className="relative z-10 flex h-[160px] w-[150px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <div className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
            Archived
          </div>
        </div>
        <motion.div
          animate={{
            scale: archivedEmailCount > 0 ? [1, 1.02, 1] : 1,
          }}
          transition={{ duration: 0.2 }}
          className="flex flex-1 flex-col items-center justify-center"
        >
          <Archive className="mb-2 h-5 w-5 text-gray-400" />
          <motion.div
            key={archivedEmailCount}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="text-[11px] font-medium text-gray-600 dark:text-gray-300"
          >
            {archivedEmailCount} emails
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
