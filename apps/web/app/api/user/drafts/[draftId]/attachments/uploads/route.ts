import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { draftAttachmentMetadataSchema } from "@/utils/actions/draft-attachments.validation";
import {
  type DraftMessageUploadPart,
  GMAIL_UPLOAD_CHUNK_BYTES,
  GRAPH_UPLOAD_CHUNK_BYTES,
  usesDirectDraftAttachmentUpload,
} from "@/utils/email/draft-attachment-upload";
import { SafeError } from "@/utils/error";
import { withEmailProvider } from "@/utils/middleware";
import { saveDraftAttachmentUpload } from "@/utils/redis/draft-attachment-upload";

export type StartDraftAttachmentUploadResponse =
  | { type: "provider-url"; uploadUrl: string; chunkBytes: number }
  | {
      type: "gmail-message";
      uploadId: string;
      parts: DraftMessageUploadPart[];
      totalBytes: number;
      chunkBytes: number;
    };

const paramsSchema = z.object({ draftId: z.string().min(1).max(512) });

/**
 * Opens a provider upload session for a file too large for the direct POST.
 * Outlook hands back a pre-authenticated URL the client uploads to itself;
 * Gmail returns a MIME template the client fills and sends in chunks through
 * the upload's PUT route, which keeps the session URI server-side.
 */
export const POST = withEmailProvider(
  "user/drafts/attachments/upload-start",
  async (request, context) => {
    const { draftId } = paramsSchema.parse(await context.params);
    const attachment = draftAttachmentMetadataSchema.parse(
      await request.json(),
    );
    if (usesDirectDraftAttachmentUpload(attachment.size))
      throw new SafeError(
        "Files under 3 MiB attach in one request. POST them to the draft's attachments instead.",
      );

    const upload = await request.emailProvider.startDraftAttachmentUpload(
      draftId,
      attachment,
    );
    if (upload.type === "provider-url")
      return NextResponse.json({
        type: upload.type,
        uploadUrl: upload.uploadUrl,
        chunkBytes: GRAPH_UPLOAD_CHUNK_BYTES,
      } satisfies StartDraftAttachmentUploadResponse);

    const uploadId = randomUUID();
    await saveDraftAttachmentUpload(request.auth.emailAccountId, uploadId, {
      draftId,
      attachmentId: attachment.id,
      sessionUri: upload.sessionUri,
      totalBytes: upload.totalBytes,
      nextOffset: 0,
    });
    return NextResponse.json({
      type: upload.type,
      uploadId,
      parts: upload.parts,
      totalBytes: upload.totalBytes,
      chunkBytes: GMAIL_UPLOAD_CHUNK_BYTES,
    } satisfies StartDraftAttachmentUploadResponse);
  },
);
