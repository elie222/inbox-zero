import { z } from "zod";

// One confirmation can't touch more than this many threads. Asking again
// continues with whatever still matches.
export const BULK_INBOX_ACTION_MAX_THREADS = 10_000;

export const bulkInboxActionTypes = [
  "archive_threads",
  "trash_threads",
  "mark_read_threads",
  "label_threads",
] as const;
export type BulkInboxActionType = (typeof bulkInboxActionTypes)[number];

// Gmail only uses `query`. Outlook mirrors the searchInbox filter fields.
export const bulkInboxActionSearchSchema = z.object({
  query: z.string(),
  fromEmail: z.string().nullish(),
  readState: z.enum(["read", "unread"]).nullish(),
  categoryName: z.string().nullish(),
  folderName: z.string().nullish(),
});
export type BulkInboxActionSearch = z.infer<typeof bulkInboxActionSearchSchema>;
