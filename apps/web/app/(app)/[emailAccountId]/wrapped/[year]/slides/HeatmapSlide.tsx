"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { format, startOfWeek, addDays, getMonth } from "date-fns";
import { cn } from "@/utils";
import type { SlideProps } from "./types";

export function HeatmapSlide({ data, year }: SlideProps) {
  const heatmapData = useMemo(() => {
    // Create a map of dates to activity counts
    const activityMap = new Map<string, number>();
    let maxCount = 0;

    for (const day of data.activity.dailyActivity) {
      activityMap.set(day.date, day.count);
      maxCount = Math.max(maxCount, day.count);
    }

    // Generate all weeks of the year
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const weeks: Array<Array<{ date: string; count: number; month: number }>> =
      [];

    let currentDate = startOfWeek(startDate, { weekStartsOn: 0 });
    let currentWeek: Array<{ date: string; count: number; month: number }> = [];

    while (currentDate <= endDate) {
      if (currentDate.getDay() === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      if (currentDate >= startDate && currentDate <= endDate) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        currentWeek.push({
          date: dateStr,
          count: activityMap.get(dateStr) || 0,
          month: getMonth(currentDate),
        });
      } else {
        currentWeek.push({ date: "", count: 0, month: -1 });
      }

      currentDate = addDays(currentDate, 1);
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return { weeks, maxCount };
  }, [data.activity.dailyActivity, year]);

  const getIntensity = (count: number): string => {
    if (count === 0) return "bg-white/5";
    const ratio = count / heatmapData.maxCount;
    if (ratio < 0.25) return "bg-green-900/60";
    if (ratio < 0.5) return "bg-green-700/70";
    if (ratio < 0.75) return "bg-green-500/80";
    return "bg-green-400";
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-slate-900 to-zinc-900 p-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl text-white/80 mb-2"
      >
        Your Email Activity
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-white/60 mb-8"
      >
        GitHub-style contribution graph for your emails
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
        className="overflow-x-auto max-w-full"
      >
        <div className="flex gap-0.5">
          {heatmapData.weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-0.5">
              {week.map((day, dayIndex) => (
                <div
                  key={`${weekIndex}-${dayIndex}`}
                  className={cn(
                    "w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm transition-colors",
                    day.date ? getIntensity(day.count) : "bg-transparent",
                  )}
                  title={day.date ? `${day.date}: ${day.count} emails` : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 flex items-center gap-2 text-sm text-white/60"
      >
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-white/5" />
          <div className="w-3 h-3 rounded-sm bg-green-900/60" />
          <div className="w-3 h-3 rounded-sm bg-green-700/70" />
          <div className="w-3 h-3 rounded-sm bg-green-500/80" />
          <div className="w-3 h-3 rounded-sm bg-green-400" />
        </div>
        <span>More</span>
      </motion.div>
    </div>
  );
}
