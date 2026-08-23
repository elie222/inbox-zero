import { z } from "zod";

const mailboxItemKind = z.enum(["label", "folder"]);
const mailboxItemName = z
  .string()
  .trim()
  .min(1, "Mailbox item name is required")
  .max(255, "Mailbox item name must be 255 characters or fewer");

export const unarchiveThreadBody = z.object({ threadId: z.string() });
export type UnarchiveThreadBody = z.infer<typeof unarchiveThreadBody>;

export const untrashThreadBody = z.object({ threadId: z.string() });
export type UntrashThreadBody = z.infer<typeof untrashThreadBody>;

export const removeThreadLabelBody = z.object({
  threadId: z.string(),
  labelId: z.string(),
});
export type RemoveThreadLabelBody = z.infer<typeof removeThreadLabelBody>;

export const updateMailboxItemBody = z
  .object({
    kind: mailboxItemKind,
    id: z.string().min(1, "Mailbox item ID is required"),
    name: mailboxItemName.optional(),
    color: z
      .object({
        backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i, {
          error: "Background color must be a six-digit hex color",
        }),
        textColor: z.string().regex(/^#[0-9a-f]{6}$/i, {
          error: "Text color must be a six-digit hex color",
        }),
      })
      .optional(),
  })
  .superRefine(({ kind, name, color }, context) => {
    if (kind === "folder" && !name) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "Folder name is required",
      });
    }
    if (kind === "folder" && color) {
      context.addIssue({
        code: "custom",
        path: ["color"],
        message: "Folders do not support colors",
      });
    }
    if (kind === "label" && !name && !color) {
      context.addIssue({
        code: "custom",
        message: "A label name or color is required",
      });
    }
  });

export const deleteMailboxItemBody = z.object({
  kind: mailboxItemKind,
  id: z.string().min(1, "Mailbox item ID is required"),
});
