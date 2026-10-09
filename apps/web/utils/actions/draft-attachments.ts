"use server";

import { randomUUID } from "node:crypto";
import { actionClient } from "@/utils/actions/safe-action";
import {
  removeDraftAttachmentBody,
  startDraftAttachmentUploadBody,
} from "@/utils/actions/draft-attachments.validation";
import {
  GMAIL_UPLOAD_CHUNK_BYTES,
  GRAPH_UPLOAD_CHUNK_BYTES,
  usesDirectDraftAttachmentUpload,
} from "@/utils/email/draft-attachment-upload";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { saveDraftAttachmentUpload } from "@/utils/redis/draft-attachment-upload";

export const startDraftAttachmentUploadAction = actionClient
  .metadata({ name: "startDraftAttachmentUpload" })
  .inputSchema(startDraftAttachmentUploadBody)
  .action(
    async ({
      ctx: { emailAccountId, provider: providerName, logger },
      parsedInput: { draftId, attachment },
    }) => {
      const provider = await createEmailProvider({
        emailAccountId,
        provider: providerName,
        logger,
      });
      // Smaller files go through the one-request route instead.
      if (usesDirectDraftAttachmentUpload(attachment.size))
        throw new SafeError("This file is small enough to attach directly.");
      const upload = await provider.startDraftAttachmentUpload(
        draftId,
        attachment,
      );
      if (upload.type === "provider-url") {
        return {
          type: upload.type,
          uploadUrl: upload.uploadUrl,
          chunkBytes: GRAPH_UPLOAD_CHUNK_BYTES,
        };
      }
      const uploadId = randomUUID();
      await saveDraftAttachmentUpload(emailAccountId, uploadId, {
        draftId,
        attachmentId: attachment.id,
        sessionUri: upload.sessionUri,
        totalBytes: upload.totalBytes,
        nextOffset: 0,
      });
      return {
        type: upload.type,
        uploadId,
        parts: upload.parts,
        totalBytes: upload.totalBytes,
        chunkBytes: GMAIL_UPLOAD_CHUNK_BYTES,
      };
    },
  );

export const removeDraftAttachmentAction = actionClient
  .metadata({ name: "removeDraftAttachment" })
  .inputSchema(removeDraftAttachmentBody)
  .action(
    async ({
      ctx: { emailAccountId, provider: providerName, logger },
      parsedInput: { draftId, attachmentId },
    }) => {
      const provider = await createEmailProvider({
        emailAccountId,
        provider: providerName,
        logger,
      });
      return provider.removeDraftAttachment(draftId, attachmentId);
    },
  );
