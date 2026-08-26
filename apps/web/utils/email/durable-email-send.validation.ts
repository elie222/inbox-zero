import { z } from "zod";
import {
  EMAIL_ATTACHMENT_LIMITS,
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
  maxPayloadBytes: 5 * 1024 * 1024,
} as const;

export const durableAttachmentMetadata = z.strictObject({
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

export const durableAttachmentMetadataList = z
  .array(durableAttachmentMetadata)
  .max(EMAIL_ATTACHMENT_LIMITS.maxFiles)
  .superRefine(validateDurableAttachmentList);

export const opaqueAttachmentStageId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/u);

export const durableMultipartEmailSendBody = durableEmailSendBody.extend({
  email: z.object({
    ...sendEmailBody.shape,
    attachments: durableAttachmentMetadataList.optional(),
  }),
});

export const durableStagedEmailSendBody = durableEmailSendBody.extend({
  email: z.object({
    ...sendEmailBody.shape,
    attachments: z
      .array(
        durableAttachmentMetadata.extend({
          stagedAttachmentId: opaqueAttachmentStageId,
        }),
      )
      .max(EMAIL_ATTACHMENT_LIMITS.maxFiles)
      .superRefine(validateDurableAttachmentList)
      .optional(),
  }),
});

export type DurableStagedEmailSendBody = z.infer<
  typeof durableStagedEmailSendBody
>;

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

function validateDurableAttachmentList(
  attachments: EmailAttachmentMetadata[],
  context: z.RefinementCtx,
) {
  const validation = validateEmailAttachmentMetadata(attachments);
  if (validation.valid) return;
  context.addIssue({ code: "custom", message: validation.error });
}
