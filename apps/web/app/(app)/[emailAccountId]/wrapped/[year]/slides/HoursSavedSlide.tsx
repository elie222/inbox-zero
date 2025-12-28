"use client";

import { motion } from "framer-motion";
import { Clock, Coffee, Book, Tv } from "lucide-react";
import type { SlideProps } from "./types";

function getTimeEquivalent(hours: number): {
  icon: typeof Coffee;
  text: string;
} {
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return {
      icon: Tv,
      text: `That's ${days} full day${days === 1 ? "" : "s"} of not dealing with emails!`,
    };
  }
  if (hours >= 10) {
    return {
      icon: Book,
      text: `Enough time to read ${Math.round(hours / 5)} books!`,
    };
  }
  if (hours >= 1) {
    return {
      icon: Coffee,
      text: `Time for ${Math.round(hours * 4)} coffee breaks!`,
    };
  }
  return {
    icon: Coffee,
    text: "Every minute counts!",
  };
}

export function HoursSavedSlide({ data, year: _year }: SlideProps) {
  const hoursSaved = data.aiImpact.hoursSaved;
  const equivalent = getTimeEquivalent(hoursSaved);
  const EquivalentIcon = equivalent.icon;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-emerald-900 via-green-900 to-teal-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-8"
      >
        Time Saved with AI
      </motion.h2>

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
        className="rounded-full bg-green-500/20 p-8 mb-6"
      >
        <Clock className="h-20 w-20 text-green-400" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-center"
      >
        <p className="text-7xl md:text-9xl font-bold text-white">
          {hoursSaved}
          <span className="text-4xl md:text-5xl text-white/70">+</span>
        </p>
        <p className="text-2xl text-white/70 mt-2">hours saved</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-12 flex items-center gap-3 text-green-300"
      >
        <EquivalentIcon className="h-6 w-6" />
        <span className="text-lg">{equivalent.text}</span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-4 text-sm text-white/40"
      >
        Based on {data.aiImpact.autoArchived.toLocaleString()} archived and{" "}
        {data.aiImpact.autoLabeled.toLocaleString()} labeled emails
      </motion.p>
    </div>
  );
}
