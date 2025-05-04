import type { DateRange } from "react-day-picker";

export function getDateRangeParams(dateRange?: DateRange) {
  const params: { fromDate?: number; toDate?: number } = {};
  if (dateRange?.from) params.fromDate = +dateRange?.from;
  if (dateRange?.to) params.toDate = +dateRange?.to;
  return params;
}
