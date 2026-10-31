import { rewriteInlineImageSources } from "@inboxzero/mail-ui/inline-images";

const INLINE_IMAGE_CACHE_SIZE = 20;
// Loaded images outlive the reader so remounts and sync updates keep their previews.
const loadedInlineImages = new Map<string, Record<string, string>>();
const mountedInlineImageMessages = new Map<string, number>();

export function retainInlineImages(messageId: string) {
  mountedInlineImageMessages.set(
    messageId,
    (mountedInlineImageMessages.get(messageId) ?? 0) + 1,
  );
  return () => {
    const count = (mountedInlineImageMessages.get(messageId) ?? 1) - 1;
    if (count > 0) mountedInlineImageMessages.set(messageId, count);
    else mountedInlineImageMessages.delete(messageId);
    evictLoadedInlineImages();
  };
}

export function getLoadedInlineImages(messageId: string) {
  return loadedInlineImages.get(messageId);
}

export function inlineImageCacheKey(
  accountId: string | undefined,
  messageId: string,
  operationId?: string,
) {
  return JSON.stringify([
    accountId,
    operationId ? `outgoing:${operationId}` : messageId,
  ]);
}

export function withLoadedInlineImages(messageId: string, html: string) {
  const sources = loadedInlineImages.get(messageId);
  if (!sources) return html;
  loadedInlineImages.delete(messageId);
  loadedInlineImages.set(messageId, sources);
  return rewriteInlineImageSources(html, sources);
}

export function storeLoadedInlineImage({
  messageId,
  contentId,
  objectUrl,
}: {
  messageId: string;
  contentId: string;
  objectUrl: string;
}) {
  const sources = loadedInlineImages.get(messageId) ?? {};
  if (sources[contentId]) {
    URL.revokeObjectURL(objectUrl);
    return;
  }
  sources[contentId] = objectUrl;
  loadedInlineImages.delete(messageId);
  loadedInlineImages.set(messageId, sources);
  evictLoadedInlineImages();
}

// Mounted messages are skipped because their frames may still be showing the
// object URLs; they become evictable once their last reader unmounts.
function evictLoadedInlineImages() {
  for (const [oldestMessageId, oldestSources] of loadedInlineImages) {
    if (loadedInlineImages.size <= INLINE_IMAGE_CACHE_SIZE) break;
    if (mountedInlineImageMessages.has(oldestMessageId)) continue;
    loadedInlineImages.delete(oldestMessageId);
    for (const url of Object.values(oldestSources)) URL.revokeObjectURL(url);
  }
}
