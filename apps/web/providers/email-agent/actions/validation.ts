import { z } from "zod";

export const updateAgentConfigBody = z.object({
  enabled: z.boolean().optional(),
  canLabel: z.boolean().optional(),
  canArchive: z.boolean().optional(),
  canDraftReply: z.boolean().optional(),
  canMarkRead: z.boolean().optional(),
  canWebSearch: z.boolean().optional(),
  canCreateLabel: z.boolean().optional(),
  forwardAllowList: z.array(z.string().email()).optional(),
});

export type UpdateAgentConfigBody = z.infer<typeof updateAgentConfigBody>;

export const createAgentDocumentBody = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string(),
  type: z.enum(["MAIN", "SKILL"]),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
});

export type CreateAgentDocumentBody = z.infer<typeof createAgentDocumentBody>;

export const updateAgentDocumentBody = z.object({
  title: z.string().min(1, "Title is required").optional(),
  content: z.string().optional(),
  type: z.enum(["MAIN", "SKILL"]).optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
});

export type UpdateAgentDocumentBody = z.infer<typeof updateAgentDocumentBody>;
