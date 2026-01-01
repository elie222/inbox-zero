import { z } from "zod";

export const updateMeetingBriefsEnabledBody = z.object({
  enabled: z.boolean(),
});

export type UpdateMeetingBriefsEnabledBody = z.infer<
  typeof updateMeetingBriefsEnabledBody
>;

export const updateMeetingBriefsMinutesBeforeBody = z.object({
  minutesBefore: z
    .number()
    .min(1, "Number must be at least 1 minute")
    .max(2880, "Number must be at most 2880 minutes (48 hours)"),
});

export type UpdateMeetingBriefsMinutesBeforeBody = z.infer<
  typeof updateMeetingBriefsMinutesBeforeBody
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
