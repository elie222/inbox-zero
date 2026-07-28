import useSWR from "swr";
import type { GetMeetingRecorderSettingsResponse } from "@/app/api/user/meeting-recorder/route";
import type { GetMeetingRecorderMeetingsResponse } from "@/app/api/user/meeting-recorder/meetings/route";
import type { GetMeetingRecorderMeetingResponse } from "@/app/api/user/meeting-recorder/meetings/[meetingId]/route";
import type { GetMeetingRecorderUpcomingResponse } from "@/app/api/user/meeting-recorder/upcoming/route";

export function useMeetingRecorderSettings() {
  return useSWR<GetMeetingRecorderSettingsResponse>(
    "/api/user/meeting-recorder",
  );
}

export function useMeetingRecorderMeetings() {
  return useSWR<GetMeetingRecorderMeetingsResponse>(
    "/api/user/meeting-recorder/meetings",
  );
}

export function useMeetingRecorderMeeting(meetingId: string | null) {
  return useSWR<GetMeetingRecorderMeetingResponse>(
    meetingId ? `/api/user/meeting-recorder/meetings/${meetingId}` : null,
  );
}

export function useMeetingRecorderUpcoming() {
  return useSWR<GetMeetingRecorderUpcomingResponse>(
    "/api/user/meeting-recorder/upcoming",
  );
}
