const DOCUMENT_PATTERN = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i;

export function getInlineImageContentIds(html: string): string[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const contentIds = new Set<string>();

  for (const image of document.querySelectorAll("img[src]")) {
    const contentId = getContentIdFromSource(image.getAttribute("src"));
    if (contentId) contentIds.add(contentId);
  }

  return [...contentIds];
}

export function rewriteInlineImageSources(
  html: string,
  sourceByContentId: Record<string, string>,
): string {
  const normalizedSources = new Map(
    Object.entries(sourceByContentId).flatMap(([contentId, source]) => {
      const normalizedContentId = normalizeContentId(contentId);
      return normalizedContentId
        ? ([[normalizedContentId, source]] as const)
        : [];
    }),
  );
  if (!normalizedSources.size) return html;

  const isDocument = DOCUMENT_PATTERN.test(html);
  const document = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const image of document.querySelectorAll("img[src]")) {
    const contentId = getContentIdFromSource(image.getAttribute("src"));
    if (!contentId) continue;

    const source = normalizedSources.get(contentId);
    if (!source) continue;

    image.setAttribute("src", source);
    changed = true;
  }

  if (!changed) return html;
  return isDocument
    ? document.documentElement.outerHTML
    : document.body.innerHTML;
}

export function normalizeContentId(value: string | null | undefined) {
  if (!value) return;

  let normalized = value.trim();
  if (normalized.toLowerCase().startsWith("cid:")) {
    normalized = normalized.slice(4);
  }

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original value when a sender used malformed URL encoding.
  }

  normalized = normalized.trim().replace(/^<|>$/g, "").trim();
  return normalized ? normalized.toLowerCase() : undefined;
}

function getContentIdFromSource(source: string | null) {
  if (!source?.trim().toLowerCase().startsWith("cid:")) return;
  return normalizeContentId(source);
}
