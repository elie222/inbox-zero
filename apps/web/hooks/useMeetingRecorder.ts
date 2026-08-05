import useSWR from "swr";
import type { GetMeetingRecorderSettingsResponse } from "@/app/api/user/meeting-recorder/route";
import type { GetMeetingRecorderMeetingsResponse } from "@/app/api/user/meeting-recorder/meetings/route";
import type { GetMeetingRecorderMeetingResponse } from "@/app/api/user/meeting-recorder/meetings/[meetingId]/route";
import type { GetMeetingRecorderUpcomingResponse } from "@/app/api/user/meeting-recorder/upcoming/route";
import { getAccountScopedKey } from "@/utils/swr";

const MEETING_STATUS_REFRESH_INTERVAL = 30_000;

export function useMeetingRecorderSettings(emailAccountId?: string | null) {
  return useSWR<GetMeetingRecorderSettingsResponse>(
    getAccountScopedKey("/api/user/meeting-recorder", emailAccountId),
  );
}

export function useMeetingRecorderMeetings(emailAccountId?: string | null) {
  return useSWR<GetMeetingRecorderMeetingsResponse>(
    getAccountScopedKey("/api/user/meeting-recorder/meetings", emailAccountId),
    { refreshInterval: MEETING_STATUS_REFRESH_INTERVAL },
  );
}

export function useMeetingRecorderMeeting(
  meetingId: string | null,
  emailAccountId?: string | null,
) {
  return useSWR<GetMeetingRecorderMeetingResponse>(
    meetingId
      ? getAccountScopedKey(
          `/api/user/meeting-recorder/meetings/${meetingId}`,
          emailAccountId,
        )
      : null,
  );
}

export function useMeetingRecorderUpcoming(emailAccountId?: string | null) {
  return useSWR<GetMeetingRecorderUpcomingResponse>(
    getAccountScopedKey("/api/user/meeting-recorder/upcoming", emailAccountId),
    {
      // Every refresh fans out to the connected calendar providers, so only
      // keep polling while there are events whose status can still change.
      refreshInterval: (data) =>
        data && data.events.length === 0 ? 0 : MEETING_STATUS_REFRESH_INTERVAL,
    },
  );
}
