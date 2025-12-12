import { z } from "zod";

export const updateMeetingBriefsSettingsBody = z.object({
  enabled: z.boolean(),
  minutesBefore: z.number().min(5).max(2880), // 5 minutes to 48 hours
});

export type UpdateMeetingBriefsSettingsBody = z.infer<
  typeof updateMeetingBriefsSettingsBody
>;

const attendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const sendDebugBriefBody = z.object({
  event: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    location: z.string().optional(),
    eventUrl: z.string().optional(),
    videoConferenceLink: z.string().optional(),
    startTime: z.string(),
    endTime: z.string(),
    attendees: z.array(attendeeSchema),
  }),
});

export type SendDebugBriefBody = z.infer<typeof sendDebugBriefBody>;
