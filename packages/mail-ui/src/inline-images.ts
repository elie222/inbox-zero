const DOCUMENT_PATTERN = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i;

export function getInlineImageContentIds(html: string): string[] {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const contentIds = new Set<string>();

  for (const image of parsedDocument.querySelectorAll("img[src]")) {
    const contentId = getContentIdFromSource(image.getAttribute("src"));
    if (contentId) contentIds.add(contentId);
  }

  return [...contentIds];
}

export function rewriteInlineImageSources(
  html: string,
  sourceByContentId: Record<string, string>,
): string {
  const normalizedSources = new Map<string, string>();
  for (const [contentId, source] of Object.entries(sourceByContentId)) {
    const normalizedContentId = normalizeContentId(contentId);
    if (normalizedContentId) normalizedSources.set(normalizedContentId, source);
  }
  if (!normalizedSources.size) return html;

  const isDocument = DOCUMENT_PATTERN.test(html);
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const image of parsedDocument.querySelectorAll("img[src]")) {
    const contentId = getContentIdFromSource(image.getAttribute("src"));
    if (!contentId) continue;

    const source = normalizedSources.get(contentId);
    if (!source) continue;

    image.setAttribute("src", source);
    changed = true;
  }

  if (!changed) return html;
  return isDocument
    ? parsedDocument.documentElement.outerHTML
    : parsedDocument.body.innerHTML;
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
