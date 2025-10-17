import { z } from "zod";

export const bulkCategorySchema = z.object({
  category: z.string(),
  action: z.enum(["archive", "mark-read"]),
});
export type BulkCategorySchema = z.infer<typeof bulkCategorySchema>;

export const bulkSendersSchema = z.object({
  senders: z.array(z.string()),
  action: z.enum(["archive", "mark-read"]),
  category: z.string(),
});
export type BulkSendersSchema = z.infer<typeof bulkSendersSchema>;

export const categorizeMoreSendersSchema = z.object({
  limit: z.number().optional().default(100),
});
export type CategorizeMoreSendersSchema = z.infer<
  typeof categorizeMoreSendersSchema
>;
