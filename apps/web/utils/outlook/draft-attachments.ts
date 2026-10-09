import type {
  FileAttachment,
  UploadSession,
} from "@microsoft/microsoft-graph-types";
import type { DraftAttachmentMetadata } from "@/utils/actions/draft-attachments.validation";
import type { DraftAttachment } from "@/utils/email/types";
import { usesDirectDraftAttachmentUpload } from "@/utils/email/draft-attachment-upload";
import { isOutlookItemNotFoundError, SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  withMicrosoftGraphRetry,
  withMicrosoftGraphWriteRetry,
} from "@/utils/outlook/retry";

const ATTACHMENT_FIELDS =
  "id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId";

export async function listOutlookDraftAttachments({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}): Promise<DraftAttachment[] | null> {
  try {
    const response: { value?: FileAttachment[] } =
      await withMicrosoftGraphRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${draftId}/attachments`)
            .select(ATTACHMENT_FIELDS)
            .get(),
        logger,
      );
    return (response.value ?? []).flatMap((attachment) =>
      attachment.id
        ? [toDraftAttachment(draftId, { ...attachment, id: attachment.id })]
        : [],
    );
  } catch (error) {
    if (isOutlookItemNotFoundError(error)) return null;
    throw error;
  }
}

export async function addOutlookDraftAttachment({
  client,
  draftId,
  attachment,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  attachment: DraftAttachmentMetadata & { content: Buffer };
  logger: Logger;
}) {
  if (!usesDirectDraftAttachmentUpload(attachment.content.length))
    throw new SafeError("This file is too large to attach in one request.");
  const created: FileAttachment = await withMicrosoftGraphWriteRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${draftId}/attachments`)
        .post({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.filename,
          contentType: attachment.mimeType,
          contentBytes: attachment.content.toString("base64"),
          ...inlineFields(attachment),
        }),
    logger,
  );
  if (!created.id) throw new Error("Outlook did not confirm the attachment.");
  return created.id;
}

/**
 * Larger files go straight from the browser to Microsoft. The upload URL is
 * pre-authenticated and CORS-enabled, so no bytes or tokens pass through us.
 */
export async function createOutlookDraftAttachmentUploadSession({
  client,
  draftId,
  attachment,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  attachment: DraftAttachmentMetadata;
  logger: Logger;
}) {
  if (usesDirectDraftAttachmentUpload(attachment.size))
    throw new SafeError("This file is small enough to attach directly.");
  const session: UploadSession = await withMicrosoftGraphWriteRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${draftId}/attachments/createUploadSession`)
        .post({
          AttachmentItem: {
            attachmentType: "file",
            name: attachment.filename,
            contentType: attachment.mimeType,
            size: attachment.size,
            ...inlineFields(attachment),
          },
        }),
    logger,
  );
  if (!session.uploadUrl)
    throw new Error("Outlook did not return an attachment upload URL.");
  return session.uploadUrl;
}

export async function removeOutlookDraftAttachment({
  client,
  draftId,
  attachmentId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  attachmentId: string;
  logger: Logger;
}) {
  try {
    await withMicrosoftGraphWriteRetry(
      () =>
        client
          .getClient()
          .api(
            `/me/messages/${draftId}/attachments/${encodeURIComponent(attachmentId)}`,
          )
          .delete(),
      logger,
    );
  } catch (error) {
    // Already gone is what the user asked for.
    if (!isOutlookItemNotFoundError(error)) throw error;
  }
}

function inlineFields(attachment: DraftAttachmentMetadata) {
  return attachment.disposition === "inline" && attachment.contentId
    ? { isInline: true, contentId: attachment.contentId }
    : {};
}

function toDraftAttachment(
  draftId: string,
  attachment: FileAttachment & { id: string },
): DraftAttachment {
  const contentId = attachment.contentId?.trim().replace(/^<|>$/g, "");
  return {
    id: attachment.id,
    filename: attachment.name || "attachment",
    mimeType: attachment.contentType || "application/octet-stream",
    size: attachment.size ?? 0,
    disposition: attachment.isInline && contentId ? "inline" : "attachment",
    ...(contentId ? { contentId } : {}),
    messageId: draftId,
    providerAttachmentId: attachment.id,
  };
}
