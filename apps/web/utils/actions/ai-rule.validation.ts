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
  // Set by the bulk "process past emails" UI: lets categorization run on a
  // thread's representative message even when the thread isn't categorized yet.
  isHistorical: z.boolean().nullish(),
});
export type RunRulesBody = z.infer<typeof runRulesBody>;
