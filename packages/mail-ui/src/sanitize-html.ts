import DOMPurify from "dompurify";

export function sanitizeMailHtml(html: string) {
  return `<!doctype html>${DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    WHOLE_DOCUMENT: true,
  })}`;
}
