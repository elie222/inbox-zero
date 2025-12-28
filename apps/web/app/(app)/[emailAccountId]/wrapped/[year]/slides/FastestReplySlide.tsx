"use client";

import { motion } from "framer-motion";
import { Zap, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { SlideProps } from "./types";

function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1 minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return mins > 0
      ? `${hours}h ${mins}m`
      : `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? `${days}d ${remainingHours}h`
    : `${days} day${days === 1 ? "" : "s"}`;
}

export function FastestReplySlide({ data, year: _year }: SlideProps) {
  const hasData = data.responseTime.fastestReplyMins !== null;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-yellow-900 via-amber-900 to-orange-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-8"
      >
        Your Fastest Reply
      </motion.h2>

      {hasData ? (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="rounded-full bg-yellow-500/20 p-8 mb-6"
          >
            <Zap className="h-20 w-20 text-yellow-400" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-6xl md:text-7xl font-bold text-white text-center"
          >
            {formatDuration(data.responseTime.fastestReplyMins!)}
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xl text-white/70 mt-4"
          >
            Lightning fast! ⚡
          </motion.p>

          {data.responseTime.fastestReplyDate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 flex items-center gap-2 text-white/50"
            >
              <Calendar className="h-4 w-4" />
              <span>
                {format(
                  parseISO(data.responseTime.fastestReplyDate),
                  "MMMM d, yyyy",
                )}
              </span>
            </motion.div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <Zap className="h-20 w-20 text-white/30 mx-auto mb-4" />
          <p className="text-xl text-white/60">No reply data available yet</p>
        </motion.div>
      )}
    </div>
  );
}
