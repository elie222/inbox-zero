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

export const bulkProcessRulesBody = z.object({
  maxEmails: z.number().min(1).max(50_000).optional(), // Optional = process all
  concurrency: z.number().min(1).max(20).default(10),
  daysBack: z.number().min(1).max(365).optional(), // Convenience: last N days
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  skipAlreadyProcessed: z.boolean().default(true), // Skip emails with existing ExecutedRule
  processOldestFirst: z.boolean().default(true), // Process oldest emails first within each page
});
export type BulkProcessRulesBody = z.infer<typeof bulkProcessRulesBody>;
