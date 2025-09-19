import useSWR from "swr";
import type { GetCalendarsResponse } from "@/app/api/user/calendars/route";

export function useCalendars() {
  return useSWR<GetCalendarsResponse>("/api/user/calendars");
}
