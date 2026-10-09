import { validateEmailAttachmentMetadata } from "@inboxzero/email-editor/core";
import { z } from "zod";

// These values end up in MIME headers, so anything that could break out of a
// header line is rejected rather than escaped.
const CONTROL_CHARACTER = /\p{Cc}/u;
const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/u;

export const draftAttachmentMetadataSchema = z
  .object({
    id: z.string().regex(/^[\w-]{1,64}$/u, "Attachment ID is invalid."),
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !CONTROL_CHARACTER.test(value)),
    mimeType: z.string().max(255).regex(MIME_TYPE),
    size: z.number().int().nonnegative(),
    disposition: z.enum(["attachment", "inline"]),
    contentId: z.string().max(255).optional(),
  })
  .superRefine((attachment, context) => {
    const validation = validateEmailAttachmentMetadata([attachment]);
    if (!validation.valid)
      context.addIssue({ code: "custom", message: validation.error });
  });
export type DraftAttachmentMetadata = z.infer<
  typeof draftAttachmentMetadataSchema
>;

export const startDraftAttachmentUploadBody = z.object({
  draftId: z.string().min(1).max(512),
  attachment: draftAttachmentMetadataSchema,
});

export const removeDraftAttachmentBody = z.object({
  draftId: z.string().min(1).max(512),
  attachmentId: z.string().min(1).max(1024),
});
