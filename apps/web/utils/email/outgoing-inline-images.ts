import { normalizeContentId } from "@inboxzero/mail-ui/inline-images";
import {
  inlineImageCacheKey,
  retainInlineImages,
  storeLoadedInlineImage,
} from "@/utils/email/inline-image-cache";

// Copy local previews before closing the composer revokes its object URLs.
// The reader cache owns the copies through the provider's sent-message handoff.
export async function prepareOutgoingInlineImages(
  accountId: string,
  attachments: {
    disposition: "inline" | "attachment";
    contentId?: string;
    previewUrl?: string;
  }[],
) {
  const previews = await Promise.all(
    attachments.map(async (attachment) => {
      const contentId = normalizeContentId(attachment.contentId);
      if (
        attachment.disposition !== "inline" ||
        !contentId ||
        !attachment.previewUrl?.startsWith("blob:")
      )
        return null;
      try {
        const response = await fetch(attachment.previewUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        return { contentId, blob: await response.blob() };
      } catch {
        return null;
      }
    }),
  );
  return (operationId: string) => {
    if (!previews.some(Boolean)) return;
    const messageId = inlineImageCacheKey(accountId, "", operationId);
    // The outgoing row mounts after publication. A short lease bridges that
    // gap; mounted readers retain their own reference after the lease expires.
    const release = retainInlineImages(messageId);
    setTimeout(release, 30_000);
    for (const preview of previews) {
      if (!preview) continue;
      storeLoadedInlineImage({
        messageId,
        contentId: preview.contentId,
        objectUrl: URL.createObjectURL(preview.blob),
      });
    }
  };
}
