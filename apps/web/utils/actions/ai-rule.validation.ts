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

// The confirmed outcome of the ask-before-move reprocess dialog: keep the
// target folder (when a rule filed it), drop the rest, optionally return
// the thread to the inbox
export const finalizeReprocessBody = z.object({
  threadId: z.string(),
  keepLabelName: z.string().nullish(),
  returnToInbox: z.boolean(),
});
export type FinalizeReprocessBody = z.infer<typeof finalizeReprocessBody>;
