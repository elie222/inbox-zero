import { z } from "zod";
import { microsoftGraphPageTokenSchema } from "@/utils/outlook/page-token";

export const threadsQuery = z.object({
  q: z.string().nullish(),
  fromEmail: z.string().nullish(),
  limit: z.coerce.number().max(100).nullish(),
  type: z.string().nullish(),
  folderId: z.string().nullish(), // For Outlook
  inboxSection: z.enum(["focused", "other"]).nullish(),
  nextPageToken: microsoftGraphPageTokenSchema,
  labelId: z.string().nullish(), // For Google
  labelIds: z.array(z.string()).nullish(), // For Google
  excludeLabelNames: z.array(z.string()).nullish(), // For Google
  after: z.coerce.date().nullish(),
  before: z.coerce.date().nullish(),
  isUnread: z.coerce.boolean().nullish(),
});
export type ThreadsQuery = z.infer<typeof threadsQuery>;

// Opt-in slim response for list rows. Anything unrecognised falls back to the
// full response so a bad param can never drop data a caller depends on.
export const threadsView = z.enum(["full", "list"]).catch("full");
