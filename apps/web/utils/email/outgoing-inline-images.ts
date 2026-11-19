import { normalizeContentId } from "@inboxzero/mail-ui/inline-images";
import {
  inlineImageCacheKey,
  retainInlineImages,
  storeLoadedInlineImage,
} from "@/utils/email/inline-image-cache";

// Mint reader-owned URLs from the local blobs. The app's CSP blocks fetching
// blob: URLs, and closing the composer revokes its own preview URLs.
export function publishOutgoingInlineImages(
  accountId: string,
  operationId: string,
  attachments: {
    disposition: "inline" | "attachment";
    contentId?: string;
    preview?: { blob: Blob };
  }[],
) {
  const previews = attachments.flatMap(
    ({ disposition, contentId, preview }) => {
      const normalizedId = normalizeContentId(contentId);
      return disposition === "inline" && normalizedId && preview
        ? [{ contentId: normalizedId, blob: preview.blob }]
        : [];
    },
  );
  if (!previews.length) return;

  const messageId = inlineImageCacheKey(accountId, "", operationId);
  // Keep previews available until the outgoing row mounts and retains them.
  const release = retainInlineImages(messageId);
  setTimeout(release, 30_000);
  for (const { contentId, blob } of previews) {
    storeLoadedInlineImage({
      messageId,
      contentId,
      objectUrl: URL.createObjectURL(blob),
    });
  }
}
