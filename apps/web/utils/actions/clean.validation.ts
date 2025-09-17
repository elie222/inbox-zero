import { z } from "zod";
import { CleanAction } from "@prisma/client";

export const cleanInboxSchema = z.object({
  daysOld: z.number().default(7),
  instructions: z.string().default(""),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  maxEmails: z.number().optional(),
  skips: z.object({
    reply: z.boolean().default(true).nullish(),
    starred: z.boolean().default(true).nullish(),
    calendar: z.boolean().default(true).nullish(),
    receipt: z.boolean().default(false).nullish(),
    attachment: z.boolean().default(false).nullish(),
    conversation: z.boolean().default(false).nullish(),
  }),
});
export type CleanInboxBody = z.infer<typeof cleanInboxSchema>;

export const undoCleanInboxSchema = z.object({
  threadId: z.string(),
  markedDone: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
});
export type UndoCleanInboxBody = z.infer<typeof undoCleanInboxSchema>;

export const changeKeepToDoneSchema = z.object({
  threadId: z.string(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
});
export type ChangeKeepToDoneBody = z.infer<typeof changeKeepToDoneSchema>;
