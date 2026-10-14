import type { MessageAttachmentDescriptor } from "@inboxzero/mail-core/messages";
import { getAttachmentImagePreview } from "./image-preview";
import {
  getInlineImageContentIds,
  normalizeContentId,
  rewriteInlineImageSources,
} from "./inline-images";

export async function prepareInlineImages(input: {
  html: string;
  attachments: MessageAttachmentDescriptor[];
  loadAttachment: (attachmentId: string) => Promise<Blob>;
  signal: AbortSignal;
}): Promise<{ html: string; objectUrls: string[] }> {
  const attachmentIds = new Map(
    input.attachments
      .filter((attachment) => attachment.inline)
      .map((attachment) => [
        normalizeContentId(attachment.contentId),
        attachment.attachmentId,
      ]),
  );
  const entries = await Promise.all(
    getInlineImageContentIds(input.html).map(async (contentId) => {
      const attachmentId = attachmentIds.get(contentId);
      if (!attachmentId || input.signal.aborted) return;
      try {
        const image = await getAttachmentImagePreview(
          await input.loadAttachment(attachmentId),
        );
        if (!image || input.signal.aborted) return;
        return [contentId, URL.createObjectURL(image)] as const;
      } catch {
        return;
      }
    }),
  );
  const sources = Object.fromEntries(
    entries.filter((entry) => entry !== undefined),
  );
  return {
    html: rewriteInlineImageSources(input.html, sources),
    objectUrls: Object.values(sources),
  };
}
