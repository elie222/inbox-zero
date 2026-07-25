import { z } from "zod";

// What a filter matches on: an exact sender, everyone at a domain, or
// subject-line text
export const filterMatchType = z.enum(["sender", "domain", "subject"]);
export type FilterMatchType = z.infer<typeof filterMatchType>;

export const createMailFilterBody = z.object({
  matchType: filterMatchType,
  value: z.string().trim().min(1).max(320),
  // Resolved by name; the folder is created when it doesn't exist yet
  labelName: z.string().trim().min(1).max(100),
  skipInbox: z.boolean().optional(),
  markRead: z.boolean().optional(),
  star: z.boolean().optional(),
  // Also move mail already sitting in the inbox that matches
  applyToExisting: z.boolean().optional(),
});
export type CreateMailFilterBody = z.infer<typeof createMailFilterBody>;

export const proposeRuleFromEmailBody = z.object({
  from: z.string().trim().min(1).max(320),
  subject: z.string().max(500),
  snippet: z.string().max(2000).nullish(),
});
export type ProposeRuleFromEmailBody = z.infer<typeof proposeRuleFromEmailBody>;
