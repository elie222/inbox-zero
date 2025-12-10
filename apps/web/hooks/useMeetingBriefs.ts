import useSWR from "swr";
import type { GetMeetingBriefsResponse } from "@/app/api/user/meeting-briefs/route";

export function useMeetingBriefs() {
  return useSWR<GetMeetingBriefsResponse>("/api/user/meeting-briefs");
}
