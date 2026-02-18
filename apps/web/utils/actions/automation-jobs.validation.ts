import { z } from "zod";
import { AutomationJobType } from "@/generated/prisma/enums";

export const toggleAutomationJobBody = z.object({
  enabled: z.boolean(),
});
export type ToggleAutomationJobBody = z.infer<typeof toggleAutomationJobBody>;

export const saveAutomationJobBody = z.object({
  cronExpression: z.string().trim().min(1),
  jobType: z.literal(AutomationJobType.INBOX_NUDGE),
  messagingChannelId: z.string().cuid(),
  prompt: z.string().max(4000).nullish(),
});
export type SaveAutomationJobBody = z.infer<typeof saveAutomationJobBody>;
