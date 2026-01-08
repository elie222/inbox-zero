import { z } from "zod";

export const saveFollowUpSettingsBody = z.object({
  followUpRemindersEnabled: z.boolean(),
  followUpAwaitingReplyDays: z.number().int().min(1).max(30),
  followUpNeedsReplyDays: z.number().int().min(1).max(30),
});

export type SaveFollowUpSettingsBody = z.infer<typeof saveFollowUpSettingsBody>;
