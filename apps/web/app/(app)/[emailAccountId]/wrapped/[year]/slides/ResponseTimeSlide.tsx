"use client";

import { motion } from "framer-motion";
import { Clock, Timer } from "lucide-react";
import type { SlideProps } from "./types";

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function formatDurationLong(minutes: number | null): string {
  if (minutes === null) return "No data";
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days} days`;
}

export function ResponseTimeSlide({ data, year: _year }: SlideProps) {
  const hasData = data.responseTime.avgResponseTimeMins !== null;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-cyan-900 via-teal-900 to-emerald-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-12"
      >
        Your Response Speed
      </motion.h2>

      {hasData ? (
        <div className="flex flex-col md:flex-row gap-12 md:gap-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <div className="rounded-full bg-cyan-500/20 p-8 mb-4">
              <Clock className="h-16 w-16 text-cyan-400" />
            </div>
            <p className="text-6xl md:text-7xl font-bold text-white">
              {formatDuration(data.responseTime.avgResponseTimeMins)}
            </p>
            <p className="text-xl text-white/70 mt-2">average reply time</p>
            <p className="text-sm text-white/50 mt-1">
              {formatDurationLong(data.responseTime.avgResponseTimeMins)}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center"
          >
            <div className="rounded-full bg-emerald-500/20 p-8 mb-4">
              <Timer className="h-16 w-16 text-emerald-400" />
            </div>
            <p className="text-4xl md:text-5xl font-bold text-white">
              {data.responseTime.totalRepliesTracked.toLocaleString()}
            </p>
            <p className="text-xl text-white/70 mt-2">replies tracked</p>
          </motion.div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p className="text-xl text-white/60">
            No response time data available yet
          </p>
          <p className="text-sm text-white/40 mt-2">
            Keep using the app to track your response times
          </p>
        </motion.div>
      )}
    </div>
  );
}
