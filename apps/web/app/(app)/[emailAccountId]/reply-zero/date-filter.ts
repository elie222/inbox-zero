import { subDays } from "date-fns/subDays";
import { subMonths } from "date-fns/subMonths";

export type TimeRange = "all" | "3d" | "1w" | "2w" | "1m";

export function getDateFilter(timeRange: TimeRange) {
  const now = new Date();
  switch (timeRange) {
    case "all":
      return undefined;
    case "3d":
      return { lte: subDays(now, 3) };
    case "1w":
      return { lte: subDays(now, 7) };
    case "2w":
      return { lte: subDays(now, 14) };
    case "1m":
      return { lte: subMonths(now, 1) };
  }
}
