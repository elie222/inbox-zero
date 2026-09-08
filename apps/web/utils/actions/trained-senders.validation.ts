import { z } from "zod";

export const moveTrainedSenderBody = z.object({
  sender: z.string().min(1),
  ruleId: z.string().min(1),
});
export type MoveTrainedSenderBody = z.infer<typeof moveTrainedSenderBody>;

export const forgetTrainedSenderBody = z.object({
  sender: z.string().min(1),
});
export type ForgetTrainedSenderBody = z.infer<typeof forgetTrainedSenderBody>;
