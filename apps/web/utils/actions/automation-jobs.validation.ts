import { z } from "zod";

export const toggleAutomationJobBody = z.object({
  enabled: z.boolean(),
});
export type ToggleAutomationJobBody = z.infer<typeof toggleAutomationJobBody>;

export const saveAutomationJobBody = z.object({
  cronExpression: z.string().trim().min(1),
  messagingChannelId: z.string().cuid(),
  prompt: z.string().max(4000).nullish(),
});
export type SaveAutomationJobBody = z.infer<typeof saveAutomationJobBody>;

export const triggerTestCheckInBody = z.object({});
export type TriggerTestCheckInBody = z.infer<typeof triggerTestCheckInBody>;
