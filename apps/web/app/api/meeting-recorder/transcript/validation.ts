import { z } from "zod";

export const meetingRecorderTranscriptBody = z.object({
  recordingId: z.string(),
});

export type MeetingRecorderTranscriptBody = z.infer<
  typeof meetingRecorderTranscriptBody
>;
