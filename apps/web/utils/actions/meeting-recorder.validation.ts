import { z } from "zod";
import { MeetingJoinRule } from "@/generated/prisma/enums";

export const updateMeetingRecorderSettingsBody = z.object({
  enabled: z.boolean().optional(),
  joinRule: z.nativeEnum(MeetingJoinRule).optional(),
  recapEmailEnabled: z.boolean().optional(),
  followUpDraftEnabled: z.boolean().optional(),
});

export type UpdateMeetingRecorderSettingsBody = z.infer<
  typeof updateMeetingRecorderSettingsBody
>;

// Only the event id is accepted. The event itself is re-read from the account's
// own calendars, so a caller cannot point the notetaker at a meeting they were
// never invited to or attach themselves to someone else's recording.
export const setMeetingJoinOverrideBody = z.object({
  calendarEventId: z.string(),
  join: z.boolean(),
});
