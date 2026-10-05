import { z } from "zod";

export const mailPermissionsSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
  send: z.boolean(),
  settingsUrl: z.string().url(),
});

export const mailFolderSchema = z.string().min(1).max(1024);
const navigationItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["label", "folder"]),
  total: z.number().optional(),
  unread: z.number().optional(),
});
export const mailAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  provider: z.string(),
});
export const mailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  cc: z.string(),
  replyTo: z.string(),
  date: z.string(),
  snippet: z.string(),
  body: z.string(),
  unread: z.boolean(),
  draftId: z.string().nullable(),
});
export const mailboxPageSchema = z.object({
  permissions: mailPermissionsSchema,
  emailAccount: mailAccountSchema,
  threads: z.array(
    z.object({ id: z.string(), messages: z.array(mailMessageSchema) }),
  ),
  nextPageToken: z.string().nullable(),
  navigation: z
    .object({
      items: z.array(navigationItemSchema),
      counts: z.array(
        z.object({
          id: z.string(),
          systemType: z.string().optional(),
          total: z.number(),
          unread: z.number(),
        }),
      ),
      unavailable: z.boolean(),
    })
    .optional(),
});
export const threadPageSchema = z.object({
  permissions: mailPermissionsSchema,
  emailAccount: mailAccountSchema,
  threadId: z.string(),
  messages: z.array(mailMessageSchema),
});
export const editorSchema = z.object({
  emailAccountId: z.string().min(1),
  to: z.string().trim().min(1),
  cc: z.string().optional(),
  subject: z.string().trim().min(1).max(10_000),
  body: z.string().min(1).max(1_000_000),
  replyToMessageId: z.string().optional(),
  draftId: z.string().optional(),
});
export type MailMessage = z.infer<typeof mailMessageSchema>;
export type EditorInput = z.infer<typeof editorSchema>;
export type MailFolder = z.infer<typeof mailFolderSchema>;
