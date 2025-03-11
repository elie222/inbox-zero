import { z } from "zod";
import { CleanAction } from "@prisma/client";

export const cleanInboxSchema = z.object({
  daysOld: z.number().default(7).optional(),
  prompt: z.string().optional(),
  action: z
    .enum([CleanAction.ARCHIVE, CleanAction.MARK_READ])
    .default(CleanAction.ARCHIVE)
    .optional(),
  maxEmails: z.number().optional(),
});

export type CleanInboxBody = z.infer<typeof cleanInboxSchema>;

export const undoCleanInboxSchema = z.object({
  threadId: z.string(),
  archived: z.boolean(),
});

export type UndoCleanInboxBody = z.infer<typeof undoCleanInboxSchema>;
