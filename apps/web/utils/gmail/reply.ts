import he from "he";
import type { ParsedMessage } from "@/utils/types";
import { convertNewlinesToBr, escapeHtml } from "@/utils/string";

export const createReplyContent = ({
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

  // Format HTML version with Gmail-style quote formatting
  const html = `<div ${dirAttribute}>${contentHtml}</div>
<br>
<div class="gmail_quote gmail_quote_container">
  <div ${dirAttribute} class="gmail_attr">${escapeHtml(quotedHeader)}<br></div>
  <blockquote class="gmail_quote" 
    style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
    ${messageContent}
  </blockquote>
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
