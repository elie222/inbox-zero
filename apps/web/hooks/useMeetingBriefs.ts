import useSWR from "swr";
import type { GetMeetingBriefsSettingsResponse } from "@/app/api/user/meeting-briefs/route";
import type { GetMeetingBriefsHistoryResponse } from "@/app/api/user/meeting-briefs/history/route";

export function useMeetingBriefSettings() {
  return useSWR<GetMeetingBriefsSettingsResponse>("/api/user/meeting-briefs");
}

export function useMeetingBriefsHistory() {
  return useSWR<GetMeetingBriefsHistoryResponse>(
    "/api/user/meeting-briefs/history",
  );
}
