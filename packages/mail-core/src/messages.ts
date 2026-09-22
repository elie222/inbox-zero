import { z } from "zod";

export const mailboxRoleSchema = z.enum([
  "inbox",
  "sent",
  "draft",
  "trash",
  "spam",
]);
export type MailboxRole = z.infer<typeof mailboxRoleSchema>;

export const messageAttachmentDescriptorSchema = z.object({
  attachmentId: z.string().min(1).max(512),
  filename: z.string().max(1024),
  mimeType: z.string().max(256),
  size: z.number().int().nonnegative(),
  inline: z.boolean(),
});
export type MessageAttachmentDescriptor = z.infer<
  typeof messageAttachmentDescriptorSchema
>;

export const messageMetadataSchema = z.object({
  subject: z.string().max(16_384),
  preview: z.string().max(16_384),
  externalUrl: z.string().max(16_384).nullable().optional(),
  from: z.string().max(4096),
  to: z.array(z.string().max(4096)).max(500),
  cc: z.array(z.string().max(4096)).max(500),
  receivedAtMs: z.number().int(),
  read: z.boolean(),
  starred: z.boolean(),
  folderId: z.string().max(256).nullable(),
  labelIds: z.array(z.string().max(256)).max(500),
  categoryIds: z.array(z.string().max(256)).max(500),
  roles: z.array(mailboxRoleSchema).max(8),
  hasAttachments: z.boolean(),
});
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export const messageMetadataPatchSchema = messageMetadataSchema.partial();
export type MessageMetadataPatch = z.infer<typeof messageMetadataPatchSchema>;
