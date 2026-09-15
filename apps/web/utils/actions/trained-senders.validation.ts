import { z } from "zod";

export const moveTrainedSenderBody = z.object({
  sender: z.string().min(1),
  ruleId: z.string().min(1),
});

export const trainedSenderBody = z.object({
  sender: z.string().min(1),
});
