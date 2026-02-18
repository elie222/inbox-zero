import { z } from "zod";
import { AUTOMATION_JOB_TYPES } from "@/utils/automation-jobs/defaults";

export const toggleAutomationJobBody = z.object({
  enabled: z.boolean(),
});
export type ToggleAutomationJobBody = z.infer<typeof toggleAutomationJobBody>;

export const saveAutomationJobBody = z.object({
  cronExpression: z.string().trim().min(1),
  jobType: z.enum([
    AUTOMATION_JOB_TYPES.INBOX_NUDGE,
    AUTOMATION_JOB_TYPES.INBOX_SUMMARY,
  ]),
  messagingChannelId: z.string().cuid(),
  prompt: z.string().max(4000).nullish(),
});
export type SaveAutomationJobBody = z.infer<typeof saveAutomationJobBody>;
