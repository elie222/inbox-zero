import useSWR from "swr";
import type { GetRecallCalendarResponse } from "@/app/api/user/recall-calendar/route";

export function useRecallCalendar() {
  return useSWR<GetRecallCalendarResponse>("/api/user/recall-calendar");
}
