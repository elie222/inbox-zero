import { z } from "zod";

export const testAiCustomContentBody = z.object({
  content: z.string().min(1, "Please enter a message"),
});
export type TestAiCustomContentBody = z.infer<typeof testAiCustomContentBody>;

export const runRulesBody = z.object({
  messageId: z.string(),
  threadId: z.string(),
  rerun: z.boolean().nullish(),
  isTest: z.boolean(),
});
export type RunRulesBody = z.infer<typeof runRulesBody>;
