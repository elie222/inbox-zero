import { z } from "zod";

export const toggleFollowUpRemindersBody = z.object({
  enabled: z.boolean(),
});
export type ToggleFollowUpRemindersBody = z.infer<
  typeof toggleFollowUpRemindersBody
>;

export const saveFollowUpSettingsBody = z.object({
  followUpAwaitingReplyDays: z.number().int().min(1).max(30),
  followUpNeedsReplyDays: z.number().int().min(1).max(30),
  followUpAutoDraftEnabled: z.boolean(),
});
export type SaveFollowUpSettingsBody = z.infer<typeof saveFollowUpSettingsBody>;
