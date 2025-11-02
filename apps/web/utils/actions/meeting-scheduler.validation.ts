import { z } from "zod";

export const updateMeetingSchedulerSettingsBody = z.object({
  meetingSchedulerEnabled: z.boolean().optional(),
  meetingSchedulerDefaultDuration: z.number().int().min(15).max(240).optional(),
  meetingSchedulerPreferredProvider: z
    .enum(["auto", "teams", "google-meet", "zoom", "none"])
    .nullable()
    .optional(),
  meetingSchedulerWorkingHoursStart: z.number().int().min(0).max(23).optional(),
  meetingSchedulerWorkingHoursEnd: z.number().int().min(0).max(23).optional(),
  meetingSchedulerAutoCreate: z.boolean().optional(),
});

export type UpdateMeetingSchedulerSettingsBody = z.infer<
  typeof updateMeetingSchedulerSettingsBody
>;
