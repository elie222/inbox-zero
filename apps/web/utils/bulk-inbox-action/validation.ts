import { z } from "zod";

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
