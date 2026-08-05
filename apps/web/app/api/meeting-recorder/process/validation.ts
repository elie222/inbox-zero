import { z } from "zod";

export const meetingRecorderProcessBody = z.object({
  meetingId: z.string(),
});

export type MeetingRecorderProcessBody = z.infer<
  typeof meetingRecorderProcessBody
>;
