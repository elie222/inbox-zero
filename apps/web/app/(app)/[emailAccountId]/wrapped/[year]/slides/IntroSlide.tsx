"use client";

import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import type { SlideProps } from "./types";

export function IntroSlide({ data, year }: SlideProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="mb-8"
      >
        <Mail className="h-24 w-24 text-white" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-5xl md:text-7xl font-bold text-white text-center mb-4"
      >
        Your {year}
      </motion.h1>

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-yellow-400 text-center"
      >
        Email Wrapped
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 text-lg text-white/70 text-center"
      >
        {data.activity.dataMonths < 12
          ? `Based on ${data.activity.dataMonths} months of data`
          : "Your complete year in email"}
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-12 text-sm text-white/50"
      >
        Use arrow keys or swipe to navigate
      </motion.p>
    </div>
  );
}
