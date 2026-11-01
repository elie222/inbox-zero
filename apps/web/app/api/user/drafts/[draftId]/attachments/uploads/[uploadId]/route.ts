import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GMAIL_UPLOAD_CHUNK_BYTES,
  parseContentRange,
  validateGmailUploadChunk,
} from "@/utils/email/draft-attachment-upload";
import type { DraftAttachmentsResult } from "@/utils/email/types";
import { SafeError } from "@/utils/error";
import { uploadGmailDraftChunk } from "@/utils/gmail/resumable-draft-upload";
import { withEmailProvider } from "@/utils/middleware";
import {
  deleteDraftAttachmentUpload,
  getDraftAttachmentUpload,
  saveDraftAttachmentUpload,
} from "@/utils/redis/draft-attachment-upload";
import { readRequestBytes } from "@/utils/request-body";

export const maxDuration = 120;

export type UploadDraftMessageChunkResponse =
  | { status: "incomplete"; nextOffset: number }
  | ({ status: "complete"; attachmentId: string } & DraftAttachmentsResult);

const paramsSchema = z.object({
  draftId: z.string().min(1),
  uploadId: z.uuid(),
});

/**
 * Forwards one chunk of a Gmail draft upload. The session URI and the token
 * stay here; the browser only ever names the upload it was given, and the
 * key includes the account so another account's upload id finds nothing.
 */
export const PUT = withEmailProvider(
  "user/drafts/attachments/upload-chunk",
  async (request, context) => {
    const { draftId, uploadId } = paramsSchema.parse(await context.params);
    const { emailAccountId } = request.auth;
    const upload = await getDraftAttachmentUpload(emailAccountId, uploadId);
    if (!upload || upload.draftId !== draftId)
      throw new SafeError("This upload expired. Attach the file again.", 404);

    const range = parseContentRange(request.headers.get("content-range"));
    if (!range || range.total !== upload.totalBytes)
      throw new SafeError("Upload chunk range is invalid.");
    const validation = validateGmailUploadChunk({
      start: range.start,
      length: range.length,
      totalBytes: upload.totalBytes,
      expectedStart: upload.nextOffset,
    });
    if (!validation.valid) throw new SafeError(validation.error, 409);

    const bytes = await readRequestBytes(request, GMAIL_UPLOAD_CHUNK_BYTES);
    if (!bytes || bytes.byteLength !== range.length)
      throw new SafeError("Upload chunk does not match its range.");

    const result = await uploadGmailDraftChunk({
      accessToken: request.emailProvider.getAccessToken(),
      sessionUri: upload.sessionUri,
      start: range.start,
      bytes,
      totalBytes: upload.totalBytes,
    });
    if (result.status === "incomplete") {
      await saveDraftAttachmentUpload(emailAccountId, uploadId, {
        ...upload,
        nextOffset: result.nextOffset,
      });
      return NextResponse.json({
        status: "incomplete",
        nextOffset: result.nextOffset,
      } satisfies UploadDraftMessageChunkResponse);
    }

    await deleteDraftAttachmentUpload(emailAccountId, uploadId);
    const attachments =
      await request.emailProvider.getDraftAttachments(draftId);
    if (!attachments)
      throw new SafeError(
        "This draft is no longer available. Check Sent before trying again.",
        404,
      );
    return NextResponse.json({
      status: "complete",
      attachmentId: upload.attachmentId,
      ...attachments,
    } satisfies UploadDraftMessageChunkResponse);
  },
);
