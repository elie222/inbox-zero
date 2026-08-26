import { z } from "zod";
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
    .max(10),
});

export type StageEmailAttachmentsBody = z.infer<
  typeof stageEmailAttachmentsBody
>;
export type CompleteEmailAttachmentsBody = z.infer<
  typeof completeEmailAttachmentsBody
>;
