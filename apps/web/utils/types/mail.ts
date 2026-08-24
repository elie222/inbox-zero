import { z } from "zod";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import {
  EMAIL_ATTACHMENT_LIMITS,
  validateEmailAttachments,
  type EmailComposerAttachment,
} from "@inboxzero/email-editor/core";

export const EMAIL_SEND_LIMITS = {
  maxHtmlCharacters: 1_000_000,
  maxSerializedPayloadBytes: 25 * 1024 * 1024,
} as const;

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

export const sendEmailBody = z
  .object({
    replyToEmail: z
      .object({
        threadId: z.string(),
        headerMessageId: z.string(),
        references: z.string().optional(),
        messageId: z.string().optional(),
      })
      .optional(),
    to: z.string(),
    from: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    replyTo: z.string().optional(),
    subject: z.string().max(10_000),
    messageHtml: z.string().max(EMAIL_SEND_LIMITS.maxHtmlCharacters),
    attachments: z
      .array(zodAttachment)
      .max(EMAIL_ATTACHMENT_LIMITS.maxFiles)
      .optional(),
  })
  .superRefine((body, context) => {
    const payloadValidation = validateSendEmailPayloadSize(body);
    if (!payloadValidation.valid) {
      context.addIssue({
        code: "custom",
        message: payloadValidation.error,
      });
    }

    if (!body.attachments?.length) return;

    const attachments: EmailComposerAttachment[] = body.attachments.map(
      (attachment, index) => ({
        id: attachment.id ?? `attachment-${index}`,
        filename: attachment.filename,
        mimeType: attachment.contentType,
        size: decodedBase64Size(attachment.content),
        contentBase64: attachment.content,
        disposition: attachment.disposition ?? "attachment",
        contentId: attachment.contentId,
      }),
    );
    const validation = validateEmailAttachments(attachments);
    if (validation.valid) return;

    context.addIssue({
      code: "custom",
      message: validation.error,
      path: ["attachments"],
    });
  });
export type SendEmailBody = z.infer<typeof sendEmailBody>;

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

export function validateSendEmailPayloadSize(
  payload: unknown,
): { valid: true } | { valid: false; error: string } {
  const serialized = JSON.stringify(payload);
  if (!serialized) {
    return { valid: false, error: "The email payload is invalid." };
  }
  const size = new TextEncoder().encode(serialized).byteLength;
  if (size <= EMAIL_SEND_LIMITS.maxSerializedPayloadBytes) {
    return { valid: true };
  }
  return {
    valid: false,
    error: "The email body and attachments are too large to send together.",
  };
}

function decodedBase64Size(value: string) {
  const normalized = value.trim();
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}
