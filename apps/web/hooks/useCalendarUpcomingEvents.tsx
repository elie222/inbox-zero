import useSWR from "swr";
import type { GetCalendarUpcomingEventsResponse } from "@/app/api/user/calendar/upcoming-events/route";

export function useCalendarUpcomingEvents() {
  return useSWR<GetCalendarUpcomingEventsResponse>(
    "/api/user/calendar/upcoming-events",
  );
}
