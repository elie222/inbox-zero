import { z } from "zod";

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
    .max(500),
});
