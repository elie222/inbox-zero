import DOMPurify from "dompurify";
import { linkifyHtml } from "./linkify";

export function sanitizeMailHtml(html: string) {
  const root = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    WHOLE_DOCUMENT: true,
    RETURN_DOM: true,
  }) as HTMLElement;

  // Tracking pixels only report opens. Dropping them keeps that signal from
  // the sender, and a pixel that fails to load can't paint a broken frame.
  for (const image of root.querySelectorAll("img")) {
    if (isTrackingPixel(image)) image.remove();
  }

  linkifyHtml(root);

  return `<!doctype html>${root.outerHTML}`;
}

function isTrackingPixel(image: HTMLImageElement) {
  return (
    isAtMostOnePixel(image.getAttribute("width") ?? image.style.width) &&
    isAtMostOnePixel(image.getAttribute("height") ?? image.style.height)
  );
}

function isAtMostOnePixel(value: string) {
  const size = Number.parseFloat(value);
  return Number.isFinite(size) && size <= 1 && !value.trim().endsWith("%");
}
