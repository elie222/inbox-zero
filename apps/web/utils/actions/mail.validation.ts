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
  id: z.string().min(1, "Mailbox item ID is required"),
  name: z
    .string()
    .trim()
    .min(1, "Mailbox item name is required")
    .max(255, "Mailbox item name must be 255 characters or fewer"),
});

export const deleteMailboxItemBody = z.object({
  kind: mailboxItemKind,
  id: z.string().min(1, "Mailbox item ID is required"),
});

export const updateLabelColorBody = z.object({
  labelId: z.string().min(1, "Category ID is required"),
  color: z.enum(OUTLOOK_CATEGORY_COLOR_IDS, {
    error: "Category color must be a supported Outlook preset",
  }),
});
