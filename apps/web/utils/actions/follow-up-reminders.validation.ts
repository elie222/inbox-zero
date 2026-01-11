import { z } from "zod";

export const DEFAULT_FOLLOW_UP_DAYS = 3;

export const toggleFollowUpRemindersBody = z.object({
  enabled: z.boolean(),
});
export type ToggleFollowUpRemindersBody = z.infer<
  typeof toggleFollowUpRemindersBody
>;

const daysSchema = z.number().min(0.001).max(90).nullable();

export const saveFollowUpSettingsBody = z.object({
  followUpAwaitingReplyDays: daysSchema,
  followUpNeedsReplyDays: daysSchema,
  followUpAutoDraftEnabled: z.boolean(),
});
export type SaveFollowUpSettingsBody = z.infer<typeof saveFollowUpSettingsBody>;

export const saveFollowUpSettingsFormBody = z.object({
  followUpAwaitingReplyDays: z.string(),
  followUpNeedsReplyDays: z.string(),
  followUpAutoDraftEnabled: z.boolean(),
});
export type SaveFollowUpSettingsFormInput = z.infer<
  typeof saveFollowUpSettingsFormBody
>;
