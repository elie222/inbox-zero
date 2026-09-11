import { BRAND_NAME } from "@/utils/branding";
import { escapeHtml } from "@/utils/string";

export function renderSentWithFooterHtml(link: string) {
  return `<div>Sent with <a href="${escapeHtml(link)}">${escapeHtml(BRAND_NAME)}</a></div>`;
}
