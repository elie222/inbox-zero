import { z } from "zod";

export const toggleFollowUpRemindersBody = z.object({
  enabled: z.boolean(),
});
export type ToggleFollowUpRemindersBody = z.infer<
  typeof toggleFollowUpRemindersBody
>;

const daysSchema = z.number().min(0.001).max(90);

export const saveFollowUpSettingsBody = z.object({
  followUpAwaitingReplyDays: daysSchema,
  followUpNeedsReplyDays: daysSchema,
  followUpAutoDraftEnabled: z.boolean(),
});
export type SaveFollowUpSettingsBody = z.infer<typeof saveFollowUpSettingsBody>;
