import { z } from "zod";
import { BULK_ARCHIVE_THREADS_ACTION_LIMIT } from "@/utils/actions/mail-bulk-action.constants";

export const bulkSenderActionSchema = z.object({
  froms: z.array(z.string().trim().min(1)).min(1),
});

export const bulkArchiveThreadsActionSchema = z.object({
  threads: z
    .array(
      z.object({
        threadId: z.string().min(1),
        messageIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(BULK_ARCHIVE_THREADS_ACTION_LIMIT),
});
