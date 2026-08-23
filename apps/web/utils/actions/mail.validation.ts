import { z } from "zod";
import { OUTLOOK_CATEGORY_COLOR_IDS } from "@/utils/outlook/category-colors";

const mailboxItemKind = z.enum(["label", "folder"]);

export const unarchiveThreadBody = z.object({ threadId: z.string() });
export type UnarchiveThreadBody = z.infer<typeof unarchiveThreadBody>;

export const untrashThreadBody = z.object({ threadId: z.string() });
export type UntrashThreadBody = z.infer<typeof untrashThreadBody>;

export const removeThreadLabelBody = z.object({
  threadId: z.string(),
  labelId: z.string(),
});
export type RemoveThreadLabelBody = z.infer<typeof removeThreadLabelBody>;

export const renameMailboxItemBody = z.object({
  kind: mailboxItemKind,
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255),
});

export const deleteMailboxItemBody = z.object({
  kind: mailboxItemKind,
  id: z.string().min(1),
});

export const updateLabelColorBody = z.object({
  labelId: z.string().min(1),
  color: z.enum(OUTLOOK_CATEGORY_COLOR_IDS),
});
