import { sendEmailBody } from "@/utils/types/mail";
import { labelVisibility, messageVisibility } from "@/utils/gmail/constants";
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
    labelListVisibility: z.enum(labelVisibility).optional(),
    messageListVisibility: z.enum(messageVisibility).optional(),
  })
  .superRefine(({ kind, name, color, ...visibility }, context) => {
    const hasVisibility = Boolean(
      visibility.labelListVisibility || visibility.messageListVisibility,
    );
    if (kind === "folder" && hasVisibility) {
      context.addIssue({
        code: "custom",
        message: "Folders do not support visibility settings",
      });
    }
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
    if (kind === "label" && !name && !color && !hasVisibility) {
      context.addIssue({
        code: "custom",
        message: "A label name, color, or visibility setting is required",
      });
    }
  });

export const deleteMailboxItemBody = z.object({
  kind: mailboxItemKind,
  id: z.string().min(1, "Mailbox item ID is required"),
});

export const updateDraftBody = z.object({
  draftMessageId: z.string().min(1),
  draftId: z.string().min(1).optional(),
  messageHtml: z.string().max(1_000_000),
  subject: z.string().max(10_000),
  to: z.string(),
  cc: z.string(),
  bcc: z.string(),
});

export const saveComposeDraftBody = z.object({
  draftId: z.string().min(1).optional(),
  content: sendEmailBody,
});
export const discardComposeDraftBody = z.object({
  draftId: z.string().min(1),
});
