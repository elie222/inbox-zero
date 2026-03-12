import he from "he";
import type { ParsedMessage } from "@/utils/types";
import { convertNewlinesToBr, escapeHtml } from "@/utils/string";

export const createOutlookReplyContent = ({
  textContent,
  htmlContent,
  message,
}: {
  textContent?: string;
  htmlContent?: string;
  message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml">;
}): {
  html: string;
  text: string;
} => {
  const quotedDate = formatEmailDate(new Date(message.headers.date));
  const quotedHeader = `On ${quotedDate}, ${message.headers.from} wrote:`;

  // Detect text direction from original message
  const textDirection = detectTextDirection(textContent || "");
  const dirAttribute = `dir="${textDirection}"`;

  // Format plain text version with proper quoting
  const quotedContent = message.textPlain
    ?.split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const plainTextReply = renderPlainTextReplyBody(textContent, htmlContent);
  const plainText =
    `${plainTextReply}\n\n${quotedHeader}\n\n${quotedContent || ""}`.trim();

  const messageContent =
    message.textHtml ||
    (message.textPlain ? convertNewlinesToBr(message.textPlain) : "");

  const contentHtml =
    htmlContent || (textContent ? convertNewlinesToBr(textContent) : "");

  // Outlook-specific font styling with Aptos as default
  const outlookFontStyle =
    "font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);";

  // Format HTML version with Outlook-style formatting
  const html =
    `<div ${dirAttribute} style="${outlookFontStyle}">${contentHtml}</div>
<br>
<div style="border-top: 1px solid #e1e1e1; padding-top: 10px; margin-top: 10px;">
  <div ${dirAttribute} style="font-size: 11pt; color: rgb(0, 0, 0);">${escapeHtml(quotedHeader)}<br></div>
  <div style="margin-top: 10px;">
    ${messageContent}
  </div>
</div>`.trim();

  return {
    text: plainText,
    html,
  };
};

function detectTextDirection(text: string): "ltr" | "rtl" {
  // Basic RTL detection - checks for RTL characters at the start of the text
  const rtlRegex =
    /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text.trim().charAt(0)) ? "rtl" : "ltr";
}

export function formatEmailDate(date: Date): string {
  const weekday = date.toLocaleString("en-US", { weekday: "short" });
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = date.getHours();
  const minute = date.getMinutes();

  // Format: "Thu, 6 Feb 2025 at 23:23"
  return `${weekday}, ${day} ${month} ${year} at ${hour}:${minute.toString().padStart(2, "0")}`;
}

function renderPlainTextReplyBody(textContent?: string, htmlContent?: string) {
  const content = normalizePlainText(
    replaceMarkdownLinksWithPlainText(htmlContent || textContent || ""),
  );
  if (!content) return "";

  if (!containsHtml(content)) return he.decode(content);

  const htmlText = content
    .replace(
      /<a\s+[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote, href: string, label: string) => {
        const plainLabel = normalizePlainText(stripHtmlTags(label));
        if (!plainLabel) return href;
        return plainLabel.includes(href)
          ? plainLabel
          : `${plainLabel} [${href}]`;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:blockquote|div|h[1-6]|li|p|tr)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");

  return normalizePlainText(he.decode(htmlText));
}

function replaceMarkdownLinksWithPlainText(value: string) {
  return value.replace(
    /\[([^[\]]+)\]\(((?:[^()\s]+|\([^()\s]*\))+)\)/g,
    (_match, label: string, url: string) =>
      label.includes(url) ? label : `${label} [${url}]`,
  );
}

function containsHtml(value: string) {
  return /<\/?[a-z][^>]*>/i.test(value);
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizePlainText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
