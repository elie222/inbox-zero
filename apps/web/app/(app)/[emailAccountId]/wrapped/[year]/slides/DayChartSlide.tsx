"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { SlideProps } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayChartSlide({ data, year: _year }: SlideProps) {
  const chartData = useMemo(() => {
    const maxCount = Math.max(
      ...data.activity.byDayOfWeek.map((d) => d.count),
      1,
    );
    const busiestDay = data.activity.byDayOfWeek.reduce((max, day) =>
      day.count > max.count ? day : max,
    );

    return { maxCount, busiestDay };
  }, [data.activity.byDayOfWeek]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-2"
      >
        Your Busiest Days
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-white/60 mb-8"
      >
        <span className="text-purple-300 font-semibold">
          {chartData.busiestDay.day}
        </span>{" "}
        was your most active day
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-2xl"
      >
        <div className="flex items-end justify-between gap-2 md:gap-4 h-48">
          {data.activity.byDayOfWeek.map((day, index) => {
            const height = (day.count / chartData.maxCount) * 100;
            const isBusiest = day.day === chartData.busiestDay.day;

            return (
              <motion.div
                key={day.day}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(height, 5)}%` }}
                transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                className="flex-1 flex flex-col items-center"
              >
                <div
                  className={`w-full rounded-t-lg ${
                    isBusiest
                      ? "bg-gradient-to-t from-pink-500 to-yellow-400"
                      : "bg-white/20"
                  }`}
                  style={{ height: "100%" }}
                />
                <p
                  className={`mt-2 text-sm ${isBusiest ? "text-white font-semibold" : "text-white/60"}`}
                >
                  {DAYS[index]}
                </p>
                <p className="text-xs text-white/40">
                  {day.count.toLocaleString()}
                </p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
