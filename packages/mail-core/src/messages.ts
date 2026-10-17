import { z } from "zod";

export const mailboxRoleSchema = z.enum([
  "inbox",
  "sent",
  "draft",
  "trash",
  "spam",
]);
export type MailboxRole = z.infer<typeof mailboxRoleSchema>;

export const inboxSectionSchema = z.enum(["focused", "other"]);
export type InboxSection = z.infer<typeof inboxSectionSchema>;

export const MAX_ATTACHMENT_CONTENT_ID_LENGTH = 1024;
export const MAX_ATTACHMENT_ID_LENGTH = 2048;
export const MAX_ATTACHMENT_FILENAME_LENGTH = 1024;
export const MAX_ATTACHMENT_MIME_TYPE_LENGTH = 256;

export const messageAttachmentDescriptorSchema = z.object({
  attachmentId: z.string().min(1).max(MAX_ATTACHMENT_ID_LENGTH),
  filename: z.string().max(MAX_ATTACHMENT_FILENAME_LENGTH),
  mimeType: z.string().max(MAX_ATTACHMENT_MIME_TYPE_LENGTH),
  size: z.number().int().nonnegative(),
  inline: z.boolean(),
  contentId: z
    .string()
    .max(MAX_ATTACHMENT_CONTENT_ID_LENGTH)
    .nullable()
    .optional(),
});
export type MessageAttachmentDescriptor = z.infer<
  typeof messageAttachmentDescriptorSchema
>;

export const MAX_MESSAGE_TEXT_LENGTH = 16_384;
export const MAX_ADDRESS_LENGTH = 4096;
export const MAX_RECIPIENTS = 500;
export const MAX_MESSAGE_LABELS = 500;

export const messageMetadataSchema = z.object({
  subject: z.string().max(MAX_MESSAGE_TEXT_LENGTH),
  preview: z.string().max(MAX_MESSAGE_TEXT_LENGTH),
  externalUrl: z.string().max(MAX_MESSAGE_TEXT_LENGTH).nullable().optional(),
  from: z.string().max(MAX_ADDRESS_LENGTH),
  to: z.array(z.string().max(MAX_ADDRESS_LENGTH)).max(MAX_RECIPIENTS),
  cc: z.array(z.string().max(MAX_ADDRESS_LENGTH)).max(MAX_RECIPIENTS),
  bcc: z
    .array(z.string().max(MAX_ADDRESS_LENGTH))
    .max(MAX_RECIPIENTS)
    .optional(),
  receivedAtMs: z.number().int(),
  read: z.boolean(),
  starred: z.boolean(),
  folderId: z.string().max(256).nullable(),
  inboxSection: inboxSectionSchema.nullable().optional(),
  labelIds: z.array(z.string().max(256)).max(MAX_MESSAGE_LABELS),
  categoryIds: z.array(z.string().max(256)).max(MAX_MESSAGE_LABELS),
  roles: z.array(mailboxRoleSchema).max(8),
  hasAttachments: z.boolean(),
  snoozedUntilMs: z.number().int().nullable().optional(),
});
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const messageMetadataPatchSchema = messageMetadataSchema.partial();
export type MessageMetadataPatch = z.infer<typeof messageMetadataPatchSchema>;
