import { z } from "zod";
import { EMAIL_ATTACHMENT_LIMITS } from "@inboxzero/email-editor/core";
import {
  durableAttachmentMetadataList,
  opaqueAttachmentStageId,
} from "./durable-email-send.validation";

export const stageEmailAttachmentsBody = z.strictObject({
  mutationId: z.string().uuid(),
  queuedAt: z.number().int().nonnegative(),
  attachments: durableAttachmentMetadataList.min(1),
});

export const completeEmailAttachmentsBody = z.strictObject({
  mutationId: z.string().uuid(),
  attachments: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(512),
        stageId: opaqueAttachmentStageId,
      }),
    )
    .min(1)
    .max(EMAIL_ATTACHMENT_LIMITS.maxFiles),
});

export type StageEmailAttachmentsBody = z.infer<
  typeof stageEmailAttachmentsBody
>;
export type CompleteEmailAttachmentsBody = z.infer<
  typeof completeEmailAttachmentsBody
>;
