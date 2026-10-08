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

export const messageAttachmentDescriptorSchema = z.object({
  attachmentId: z.string().min(1).max(MAX_ATTACHMENT_ID_LENGTH),
  filename: z.string().max(1024),
  mimeType: z.string().max(256),
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

export const MAX_RECIPIENTS = 500;

export const messageMetadataSchema = z.object({
  subject: z.string().max(16_384),
  preview: z.string().max(16_384),
  externalUrl: z.string().max(16_384).nullable().optional(),
  from: z.string().max(4096),
  to: z.array(z.string().max(4096)).max(MAX_RECIPIENTS),
  cc: z.array(z.string().max(4096)).max(MAX_RECIPIENTS),
  bcc: z.array(z.string().max(4096)).max(MAX_RECIPIENTS).optional(),
  receivedAtMs: z.number().int(),
  read: z.boolean(),
  starred: z.boolean(),
  folderId: z.string().max(256).nullable(),
  inboxSection: inboxSectionSchema.nullable().optional(),
  labelIds: z.array(z.string().max(256)).max(500),
  categoryIds: z.array(z.string().max(256)).max(500),
  roles: z.array(mailboxRoleSchema).max(8),
  hasAttachments: z.boolean(),
  snoozedUntilMs: z.number().int().nullable().optional(),
});
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const messageMetadataPatchSchema = messageMetadataSchema.partial();
export type MessageMetadataPatch = z.infer<typeof messageMetadataPatchSchema>;
