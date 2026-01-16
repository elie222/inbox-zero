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

// Notification channel types
export const channelTypeSchema = z.enum([
  "slack",
  "teams",
  "telegram",
  "discord",
]);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export const upsertNotificationChannelBody = z.object({
  channelType: channelTypeSchema,
  config: z.record(z.unknown()).refine((val) => Object.keys(val).length > 0, {
    message: "Config must not be empty",
  }),
  enabled: z.boolean().optional(),
  pipedreamActionId: z.string().optional(),
});

export type UpsertNotificationChannelBody = z.infer<
  typeof upsertNotificationChannelBody
>;

export const deleteNotificationChannelBody = z.object({
  channelType: channelTypeSchema,
});

export type DeleteNotificationChannelBody = z.infer<
  typeof deleteNotificationChannelBody
>;

export const toggleNotificationChannelBody = z.object({
  channelType: channelTypeSchema,
  enabled: z.boolean(),
});

export type ToggleNotificationChannelBody = z.infer<
  typeof toggleNotificationChannelBody
>;
