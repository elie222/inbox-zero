import useSWR from "swr";
import type { GetMeetingRecorderSettingsResponse } from "@/app/api/user/meeting-recorder/route";
import type { GetMeetingRecorderMeetingsResponse } from "@/app/api/user/meeting-recorder/meetings/route";
import type { GetMeetingRecorderMeetingResponse } from "@/app/api/user/meeting-recorder/meetings/[meetingId]/route";
import type { GetMeetingRecorderUpcomingResponse } from "@/app/api/user/meeting-recorder/upcoming/route";

export function useMeetingRecorderSettings(emailAccountId?: string | null) {
  return useSWR<GetMeetingRecorderSettingsResponse>(
    getAccountScopedKey("/api/user/meeting-recorder", emailAccountId),
  );
}

export function useMeetingRecorderMeetings(emailAccountId?: string | null) {
  return useSWR<GetMeetingRecorderMeetingsResponse>(
    getAccountScopedKey("/api/user/meeting-recorder/meetings", emailAccountId),
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
  );
}

// These routes are all scoped by the authenticated email account, so the cache
// key has to carry the account or a switch would serve another account's data.
function getAccountScopedKey(path: string, emailAccountId?: string | null) {
  if (emailAccountId === undefined) return path;

  return emailAccountId ? ([path, emailAccountId] as const) : null;
}
