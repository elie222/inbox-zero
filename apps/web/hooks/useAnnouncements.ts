import useSWR from "swr";
import type { GetAnnouncementsResponse } from "@/app/api/user/announcements/route";

export function useAnnouncements() {
  return useSWR<GetAnnouncementsResponse>("/api/user/announcements");
}
