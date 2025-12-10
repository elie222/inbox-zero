import { z } from "zod";

export const updateMeetingBriefsSettingsBody = z.object({
  enabled: z.boolean(),
  minutesBefore: z.number().min(5).max(2880), // 5 minutes to 48 hours
});

export type UpdateMeetingBriefsSettingsBody = z.infer<
  typeof updateMeetingBriefsSettingsBody
>;
