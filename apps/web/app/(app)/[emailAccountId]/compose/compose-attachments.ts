import type { EmailAttachmentMetadata } from "@inboxzero/email-editor/core";
import type { DraftAttachment } from "@/utils/email/types";
import type { ComposeAttachmentReference } from "@/utils/mail-engine/reply-drafts";

export type ComposeAttachment = EmailAttachmentMetadata & {
  /** Set once the file is on the mailbox draft; it removes the file later. */
  draftAttachmentId?: string;
  status: "uploading" | "uploaded" | "failed";
  error?: string;
  previewUrl?: string;
  /**
   * An inline image this composer placed in the editor. Images that came
   * with the draft's original HTML are left alone even when the editor
   * doesn't track them.
   */
  managed?: boolean;
};

/**
 * After a change to the mailbox draft, its list is the truth for files
 * already on it. Known files keep the local id their bytes are stored under;
 * files still uploading, or that failed, stay as they are.
 */
export function mergeDraftAttachments(
  current: ComposeAttachment[],
  listed: DraftAttachment[],
): ComposeAttachment[] {
  const uploaded = listed.map((item): ComposeAttachment => {
    const known = current.find(
      (attachment) =>
        attachment.draftAttachmentId === item.id ||
        (item.contentId && attachment.contentId === item.contentId),
    );
    return {
      id: known?.id ?? item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      size: item.size,
      disposition: item.disposition,
      ...(item.contentId ? { contentId: item.contentId } : {}),
      draftAttachmentId: item.id,
      status: "uploaded",
      ...(known?.previewUrl ? { previewUrl: known.previewUrl } : {}),
      ...(known?.managed ? { managed: true } : {}),
    };
  });
  const pending = current.filter(
    (attachment) =>
      attachment.status !== "uploaded" &&
      !uploaded.some((item) => item.id === attachment.id),
  );
  return [...uploaded, ...pending];
}

/**
 * What the local draft keeps of an attachment: a reference to the file on the
 * mailbox draft, never its bytes. Files not on the draft yet aren't kept.
 */
export function toAttachmentReference({
  previewUrl: _previewUrl,
  status,
  error: _error,
  managed: _managed,
  draftAttachmentId,
  ...attachment
}: ComposeAttachment): ComposeAttachmentReference[] {
  return status === "uploaded" && draftAttachmentId
    ? [{ ...attachment, draftAttachmentId }]
    : [];
}

export function toAttachmentMetadata({
  id,
  filename,
  mimeType,
  size,
  disposition,
  contentId,
}: ComposeAttachment): EmailAttachmentMetadata {
  return {
    id,
    filename,
    mimeType,
    size,
    disposition,
    ...(contentId ? { contentId } : {}),
  };
}

// Images this composer placed in the editor go out as cid: references to
// their draft attachments; failed uploads have nothing to reference.
export function getEditorInlineAttachments(attachments: ComposeAttachment[]) {
  return attachments.filter(
    (attachment) =>
      attachment.managed &&
      attachment.disposition === "inline" &&
      attachment.status !== "failed",
  );
}
