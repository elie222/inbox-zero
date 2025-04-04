import { z } from "zod";

export const createKnowledgeBody = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string(),
});

export type CreateKnowledgeBody = z.infer<typeof createKnowledgeBody>;

export const updateKnowledgeBody = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  content: z.string(),
});

export type UpdateKnowledgeBody = z.infer<typeof updateKnowledgeBody>;

export const deleteKnowledgeBody = z.object({
  id: z.string(),
});

export type DeleteKnowledgeBody = z.infer<typeof deleteKnowledgeBody>;
