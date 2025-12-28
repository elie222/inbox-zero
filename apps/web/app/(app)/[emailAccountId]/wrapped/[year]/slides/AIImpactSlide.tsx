"use client";

import { motion } from "framer-motion";
import { Archive, Tag, Bot } from "lucide-react";
import type { SlideProps } from "./types";

export function AIImpactSlide({ data, year: _year }: SlideProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-indigo-900 to-violet-900 p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <Bot className="h-8 w-8 text-blue-400" />
        <h2 className="text-2xl md:text-3xl text-white/80">
          AI Assistant Impact
        </h2>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-white/60 mb-12 text-center max-w-md"
      >
        Here's how your AI email assistant helped you this year
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center bg-white/5 rounded-2xl p-8"
        >
          <div className="rounded-full bg-blue-500/20 p-4 mb-4">
            <Archive className="h-10 w-10 text-blue-400" />
          </div>
          <p className="text-5xl md:text-6xl font-bold text-white">
            {data.aiImpact.autoArchived.toLocaleString()}
          </p>
          <p className="text-lg text-white/70 mt-2">emails auto-archived</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center bg-white/5 rounded-2xl p-8"
        >
          <div className="rounded-full bg-purple-500/20 p-4 mb-4">
            <Tag className="h-10 w-10 text-purple-400" />
          </div>
          <p className="text-5xl md:text-6xl font-bold text-white">
            {data.aiImpact.autoLabeled.toLocaleString()}
          </p>
          <p className="text-lg text-white/70 mt-2">emails auto-labeled</p>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-12 text-lg text-white/50"
      >
        {data.aiImpact.autoArchived + data.aiImpact.autoLabeled > 0
          ? "All running on autopilot while you focused on what matters"
          : "Set up AI rules to automate your email workflow"}
      </motion.p>
    </div>
  );
}
