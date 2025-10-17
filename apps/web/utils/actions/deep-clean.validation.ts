import { z } from "zod";

export const archiveCategorySchema = z.object({ category: z.string() });
export type ArchiveCategorySchema = z.infer<typeof archiveCategorySchema>;

export const markCategoryAsReadSchema = z.object({ category: z.string() });
export type MarkCategoryAsReadSchema = z.infer<typeof markCategoryAsReadSchema>;

export const categorizeMoreSendersSchema = z.object({
  limit: z.number().optional().default(100),
});
export type CategorizeMoreSendersSchema = z.infer<
  typeof categorizeMoreSendersSchema
>;
