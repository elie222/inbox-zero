import { z } from "zod";

export const moveTrainedSenderBody = z.object({
  itemId: z.string().min(1),
  ruleId: z.string().min(1),
});
export type MoveTrainedSenderBody = z.infer<typeof moveTrainedSenderBody>;
