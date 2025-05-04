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

export const reportAiMistakeBody = z
  .object({
    message: z.object({
      from: z.string(),
      subject: z.string(),
      snippet: z.string(),
      textHtml: z.string().nullish(),
      textPlain: z.string().nullish(),
    }),
    actualRuleId: z.string().nullish(),
    expectedRuleId: z.string().nullish(),
    explanation: z.string().nullish(),
  })
  .refine((data) => data.actualRuleId != null || data.expectedRuleId != null, {
    message: "Either the actual or the expected rule must be provided",
    path: ["expectedRuleId"], // This will show the error on the expectedRuleId field
  });
export type ReportAiMistakeBody = z.infer<typeof reportAiMistakeBody>;

export const createAutomationBody = z.object({ prompt: z.string() });
export type CreateAutomationBody = z.infer<typeof createAutomationBody>;
