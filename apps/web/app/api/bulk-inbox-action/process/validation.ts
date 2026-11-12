import { z } from "zod";

export const bulkInboxActionProcessBody = z.object({
  jobId: z.string().min(1),
  chunkToken: z.string().min(1),
});

export type BulkInboxActionProcessBody = z.infer<
  typeof bulkInboxActionProcessBody
>;
