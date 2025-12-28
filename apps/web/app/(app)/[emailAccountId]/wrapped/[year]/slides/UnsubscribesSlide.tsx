"use client";

import { motion } from "framer-motion";
import { BellOff, Sparkles } from "lucide-react";
import type { SlideProps } from "./types";

export function UnsubscribesSlide({ data, year: _year }: SlideProps) {
  const unsubscribes = data.aiImpact.unsubscribes;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-8"
      >
        Inbox Decluttered
      </motion.h2>

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
        className="rounded-full bg-red-500/20 p-8 mb-6"
      >
        <BellOff className="h-20 w-20 text-red-400" />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-7xl md:text-8xl font-bold text-white"
      >
        {unsubscribes.toLocaleString()}
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-xl text-white/70 mt-4"
      >
        newsletters unsubscribed
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 flex items-center gap-2 text-green-400"
      >
        <Sparkles className="h-5 w-5" />
        <span>
          {unsubscribes > 0
            ? "Your inbox thanks you!"
            : "Keep your inbox clean by unsubscribing from unwanted emails"}
        </span>
      </motion.div>
    </div>
  );
}
