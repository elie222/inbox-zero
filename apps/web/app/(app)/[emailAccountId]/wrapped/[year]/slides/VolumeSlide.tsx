"use client";

import { motion } from "framer-motion";
import { Inbox, Send } from "lucide-react";
import type { SlideProps } from "./types";

export function VolumeSlide({ data, year: _year }: SlideProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-8"
      >
        This year, your inbox was busy
      </motion.h2>

      <div className="flex flex-col md:flex-row gap-8 md:gap-16">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center"
        >
          <div className="rounded-full bg-blue-500/20 p-6 mb-4">
            <Inbox className="h-12 w-12 text-blue-400" />
          </div>
          <p className="text-5xl md:text-7xl font-bold text-white">
            {data.volume.emailsReceived.toLocaleString()}
          </p>
          <p className="text-xl text-white/70 mt-2">emails received</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center"
        >
          <div className="rounded-full bg-green-500/20 p-6 mb-4">
            <Send className="h-12 w-12 text-green-400" />
          </div>
          <p className="text-5xl md:text-7xl font-bold text-white">
            {data.volume.emailsSent.toLocaleString()}
          </p>
          <p className="text-xl text-white/70 mt-2">emails sent</p>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-12 text-lg text-white/60"
      >
        That's {data.volume.totalEmails.toLocaleString()} emails total!
      </motion.p>
    </div>
  );
}
