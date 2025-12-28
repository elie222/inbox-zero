import prisma from "@/utils/prisma";
import { format, differenceInDays, differenceInMonths } from "date-fns";
import type { ActivityStats, DailyActivity } from "../types";

export async function computeActivityStats(
  emailAccountId: string,
  year: number,
): Promise<ActivityStats> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  // Get all emails for the year grouped by date
  const emails = await prisma.emailMessage.findMany({
    where: {
      emailAccountId,
      date: { gte: startDate, lt: endDate },
      draft: false,
    },
    select: {
      date: true,
    },
    orderBy: { date: "asc" },
  });

  // Create a map of dates to counts
  const dateCountMap = new Map<string, number>();
  for (const email of emails) {
    const dateKey = format(email.date, "yyyy-MM-dd");
    dateCountMap.set(dateKey, (dateCountMap.get(dateKey) || 0) + 1);
  }

  // Convert to array for daily activity
  const dailyActivity: DailyActivity[] = Array.from(dateCountMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate days active
  const daysActive = dateCountMap.size;

  // Calculate streaks and breaks
  const { longestStreak, longestBreak } = calculateStreaksAndBreaks(
    Array.from(dateCountMap.keys()).sort(),
  );

  // Group by day of week
  const dayOfWeekCounts = new Map<string, number>();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  for (const email of emails) {
    const dayName = dayNames[email.date.getDay()];
    dayOfWeekCounts.set(dayName, (dayOfWeekCounts.get(dayName) || 0) + 1);
  }

  const byDayOfWeek = dayNames.map((day) => ({
    day,
    count: dayOfWeekCounts.get(day) || 0,
  }));

  // Find first email date and calculate data months
  const firstEmail = emails[0];
  const firstEmailDate = firstEmail
    ? format(firstEmail.date, "yyyy-MM-dd")
    : null;
  const dataMonths = firstEmail
    ? differenceInMonths(endDate, firstEmail.date) + 1
    : 0;

  return {
    dailyActivity,
    daysActive,
    longestStreak,
    longestBreak,
    byDayOfWeek,
    firstEmailDate,
    dataMonths: Math.min(dataMonths, 12),
  };
}

function calculateStreaksAndBreaks(sortedDates: string[]): {
  longestStreak: number;
  longestBreak: number;
} {
  if (sortedDates.length === 0) {
    return { longestStreak: 0, longestBreak: 0 };
  }

  let longestStreak = 1;
  let longestBreak = 0;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]);
    const currDate = new Date(sortedDates[i]);
    const daysDiff = differenceInDays(currDate, prevDate);

    if (daysDiff === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      longestBreak = Math.max(longestBreak, daysDiff - 1);
    }
  }

  return { longestStreak, longestBreak };
}
