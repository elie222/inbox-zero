import useSWR from "swr";
import type { GetAnnouncementsResponse } from "@/app/api/user/announcements/route";

export function useAnnouncements(emailAccountId?: string) {
  const url = emailAccountId
    ? `/api/user/announcements?emailAccountId=${emailAccountId}`
    : "/api/user/announcements";
  return useSWR<GetAnnouncementsResponse>(url);
}
