import { z } from "zod";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";

export const zodAttachment = z.object({
  filename: z.string(),
  content: z.string(),
  contentType: z.string(),
});
export type Attachment = z.infer<typeof zodAttachment>;

export type WithMailerAttachments<TBody extends { attachments?: unknown }> =
  Omit<TBody, "attachments"> & {
    attachments?: MailAttachment[];
  };
