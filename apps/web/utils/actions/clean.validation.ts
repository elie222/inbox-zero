import { z } from "zod";
import { CleanAction } from "@prisma/client";

export const cleanInboxSchema = z.object({
  daysOld: z.number().default(7),
  instructions: z.string().default(""),
  action: z
    .enum([CleanAction.ARCHIVE, CleanAction.MARK_READ])
    .default(CleanAction.ARCHIVE),
  maxEmails: z.number().optional(),
  skips: z.object({
    skipReply: z.boolean().default(true).nullish(),
    skipStarred: z.boolean().default(true).nullish(),
    skipCalendar: z.boolean().default(true).nullish(),
    skipReceipt: z.boolean().default(false).nullish(),
    skipAttachment: z.boolean().default(false).nullish(),
  }),
});

export type CleanInboxBody = z.infer<typeof cleanInboxSchema>;

export const undoCleanInboxSchema = z.object({
  threadId: z.string(),
  archived: z.boolean(),
});

export type UndoCleanInboxBody = z.infer<typeof undoCleanInboxSchema>;
