"use client";

import { motion } from "framer-motion";
import { Flame, Pause, Calendar } from "lucide-react";
import type { SlideProps } from "./types";

export function StreaksSlide({ data, year: _year }: SlideProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-orange-900 via-red-900 to-pink-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-12"
      >
        Your Email Consistency
      </motion.h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center text-center"
        >
          <div className="rounded-full bg-orange-500/20 p-6 mb-4">
            <Flame className="h-12 w-12 text-orange-400" />
          </div>
          <p className="text-5xl md:text-6xl font-bold text-white">
            {data.activity.longestStreak}
          </p>
          <p className="text-lg text-white/70 mt-2">day streak</p>
          <p className="text-sm text-white/50 mt-1">
            Longest consecutive days with email
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center text-center"
        >
          <div className="rounded-full bg-blue-500/20 p-6 mb-4">
            <Pause className="h-12 w-12 text-blue-400" />
          </div>
          <p className="text-5xl md:text-6xl font-bold text-white">
            {data.activity.longestBreak}
          </p>
          <p className="text-lg text-white/70 mt-2">day break</p>
          <p className="text-sm text-white/50 mt-1">
            Longest email-free period
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col items-center text-center"
        >
          <div className="rounded-full bg-green-500/20 p-6 mb-4">
            <Calendar className="h-12 w-12 text-green-400" />
          </div>
          <p className="text-5xl md:text-6xl font-bold text-white">
            {data.activity.daysActive}
          </p>
          <p className="text-lg text-white/70 mt-2">days active</p>
          <p className="text-sm text-white/50 mt-1">Total days with emails</p>
        </motion.div>
      </div>
    </div>
  );
}
