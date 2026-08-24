import { z } from "zod";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";

export const zodAttachment = z.object({
  id: z.string().optional(),
  filename: z.string(),
  content: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative().optional(),
  disposition: z.enum(["attachment", "inline"]).optional(),
  contentId: z.string().optional(),
});
export type Attachment = z.infer<typeof zodAttachment>;

export type WithMailerAttachments<TBody extends { attachments?: unknown }> =
  Omit<TBody, "attachments"> & {
    attachments?: MailAttachment[];
  };

export function toMailerAttachments(
  attachments: Attachment[] | undefined,
): MailAttachment[] | undefined {
  return attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    encoding: "base64",
    contentType: attachment.contentType,
    ...(attachment.disposition === "inline" && attachment.contentId
      ? {
          cid: attachment.contentId,
          contentDisposition: "inline" as const,
        }
      : { contentDisposition: "attachment" as const }),
  }));
}
