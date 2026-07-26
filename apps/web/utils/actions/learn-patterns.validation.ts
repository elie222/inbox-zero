import { z } from "zod";

export const learnPatternsFromHistoryBody = z.object({
  ruleId: z.string().min(1),
});
export type LearnPatternsFromHistoryBody = z.infer<
  typeof learnPatternsFromHistoryBody
>;
