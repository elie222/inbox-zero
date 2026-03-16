import { z } from "zod";
import { AttachmentSourceType } from "@/generated/prisma/enums";

export const attachmentSourceInputSchema = z.object({
  driveConnectionId: z.string(),
  name: z.string().min(1),
  sourceId: z.string(),
  sourcePath: z.string().nullish(),
  type: z.nativeEnum(AttachmentSourceType),
});
export type AttachmentSourceInput = z.infer<typeof attachmentSourceInputSchema>;

export const selectedAttachmentSchema = z.object({
  driveConnectionId: z.string(),
  fileId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  reason: z.string().nullish(),
});
export type SelectedAttachment = z.infer<typeof selectedAttachmentSchema>;
