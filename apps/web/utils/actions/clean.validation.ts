import { z } from "zod";

export const cleanInboxSchema = z.object({
  daysOld: z.number().default(7),
  prompt: z.string().optional(),
  action: z.string().default("archive"),
  maxEmails: z.number().optional(),
});

export type CleanInboxBody = z.infer<typeof cleanInboxSchema>;

export const undoCleanInboxSchema = z.object({
  threadId: z.string(),
  archived: z.boolean(),
});

export type UndoCleanInboxBody = z.infer<typeof undoCleanInboxSchema>;
