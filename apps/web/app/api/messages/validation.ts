import { z } from "zod";

export const messageQuerySchema = z.object({
  q: z.string().nullish(),
  pageToken: z.string().nullish(),
});
export type MessageQuery = z.infer<typeof messageQuerySchema>;

export const messagesBatchQuery = z.object({
  ids: z
    .array(z.string())
    .max(100)
    .transform((arr) => [...new Set(arr)]), // Remove duplicates
  parseReplies: z.coerce.boolean().optional(),
});
export type MessagesBatchQuery = z.infer<typeof messagesBatchQuery>;

export const attachmentQuery = z.object({
  messageId: z.string(),
  attachmentId: z.string(),
  mimeType: z.string(),
  filename: z.string(),
});
export type AttachmentQuery = z.infer<typeof attachmentQuery>;
