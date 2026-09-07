import { BRAND_NAME } from "@/utils/branding";

export function renderSentWithFooterHtml(link: string) {
  return `<p style="margin:0;font-size:12px;color:#6b7280">Sent with <a href="${link}" style="color:#6b7280">${BRAND_NAME}</a></p>`;
}
