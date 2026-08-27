import { z } from "zod";
import {
  type EmailAttachmentMetadata,
  validateEmailAttachmentMetadata,
} from "@inboxzero/email-editor/core";
import { sendEmailBody } from "@/utils/types/mail";

export const durableEmailSendBody = z.object({
  mutationId: z.string().uuid(),
  queuedAt: z.number().int().nonnegative(),
  threadId: z.string().min(1).max(512),
  messageIds: z.array(z.string().min(1).max(512)).min(1).max(1000),
  email: sendEmailBody,
});

export type DurableEmailSendBody = z.infer<typeof durableEmailSendBody>;

export const DURABLE_MULTIPART_EMAIL_SEND_LIMITS = {
  maxAttachmentBytes: 3 * 1024 * 1024,
  maxPayloadBytes: 5 * 1024 * 1024,
} as const;
export const DURABLE_MULTIPART_ATTACHMENT_LIMIT_MESSAGE =
  "Attachments must total 3 MB or less. Use Gmail or Outlook for larger files.";

const multipartAttachmentMetadata = z.strictObject({
  id: z.string().min(1).max(512),
  filename: z.string().min(1).max(1024),
  mimeType: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/),
  size: z.number().int().nonnegative(),
  disposition: z.enum(["attachment", "inline"]),
  contentId: z.string().min(1).max(512).optional(),
});

const multipartAttachments = z
  .array(multipartAttachmentMetadata)
  .superRefine((attachments, context) => {
    const validation = validateEmailAttachmentMetadata(
      attachments satisfies EmailAttachmentMetadata[],
    );
    if (!validation.valid) {
      context.addIssue({
        code: "custom",
        message: validation.error,
      });
    }

    const totalBytes = attachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    if (totalBytes > DURABLE_MULTIPART_EMAIL_SEND_LIMITS.maxAttachmentBytes) {
      context.addIssue({
        code: "custom",
        message: DURABLE_MULTIPART_ATTACHMENT_LIMIT_MESSAGE,
      });
    }
  });

export const durableMultipartEmailSendBody = durableEmailSendBody.extend({
  email: z.object({
    ...sendEmailBody.shape,
    attachments: multipartAttachments.optional(),
  }),
});

export const durableMultipartEmailSendPayload = z
  .string()
  .refine(
    (value) =>
      new TextEncoder().encode(value).byteLength <=
      DURABLE_MULTIPART_EMAIL_SEND_LIMITS.maxPayloadBytes,
    "The multipart payload is too large.",
  )
  .transform((value, context): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid payload JSON." });
      return z.NEVER;
    }
  })
  .pipe(durableMultipartEmailSendBody);
