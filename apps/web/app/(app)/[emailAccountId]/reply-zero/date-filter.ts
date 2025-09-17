export type TimeRange = "all" | "3d" | "1w" | "2w" | "1m";

export function getDateFilter(timeRange: TimeRange) {
  const now = new Date();
  switch (timeRange) {
    case "all":
      return undefined;
    case "3d":
      now.setDate(now.getDate() - 3);
      break;
    case "1w":
      now.setDate(now.getDate() - 7);
      break;
    case "2w":
      now.setDate(now.getDate() - 14);
      break;
    case "1m":
      now.setMonth(now.getMonth() - 1);
      break;
  }
  return { lte: now };
}
