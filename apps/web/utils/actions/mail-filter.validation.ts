import { z } from "zod";

// What a filter matches on: an exact sender, everyone at a domain, or
// subject-line text
export const filterMatchType = z.enum(["sender", "domain", "subject"]);
export type FilterMatchType = z.infer<typeof filterMatchType>;

export const createMailFilterBody = z.object({
  matchType: filterMatchType,
  // A single sender/domain/subject, or a comma-separated list of
  // senders/domains (bulk selection)
  value: z.string().trim().min(1).max(2000),
  // Resolved by name; the folder is created when it doesn't exist yet
  labelName: z.string().trim().min(1).max(100),
  // Optional "why": becomes the rule's AI instructions, ORed with the
  // static match
  instructions: z.string().max(2000).nullish(),
  skipInbox: z.boolean().optional(),
  markRead: z.boolean().optional(),
  star: z.boolean().optional(),
  // Also move existing matching mail (wherever it sits) into the folder
  applyToExisting: z.boolean().optional(),
  // The threads the filter was created from — always moved to the folder
  // (and stripped of other folder labels), even when applyToExisting is off
  threadIds: z.array(z.string().min(1).max(200)).max(100).optional(),
});
export type CreateMailFilterBody = z.infer<typeof createMailFilterBody>;

export const proposeRuleFromEmailBody = z.object({
  from: z.string().trim().min(1).max(320),
  subject: z.string().max(500),
  snippet: z.string().max(2000).nullish(),
});
export type ProposeRuleFromEmailBody = z.infer<typeof proposeRuleFromEmailBody>;
