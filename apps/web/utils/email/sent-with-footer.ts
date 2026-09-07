import { BRAND_NAME } from "@/utils/branding";
import { escapeHtml } from "@/utils/string";

export function renderSentWithFooterHtml(link: string) {
  return `<p style="margin:0;font-size:12px;color:#6b7280">Sent with <a href="${escapeHtml(link)}" style="color:#6b7280">${escapeHtml(BRAND_NAME)}</a></p>`;
}
