import { load } from "cheerio";
import type { ParsedMessage } from "@/utils/types";
import {
  buildQuotedPlainText,
  quotePlainTextContent,
} from "@/utils/email/quoted-plain-text";
import { convertNewlinesToBr, escapeHtml } from "@/utils/string";

export function buildReplyQuote({
  textContent,
  htmlContent,
  message,
}: {
  textContent?: string;
  htmlContent?: string;
  message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml">;
}) {
  const quotedHeader = formatReplyQuotedHeader(message.headers);

  return {
    dirAttribute: `dir="${detectTextDirection(textContent || "")}"`,
    contentHtml:
      htmlContent || (textContent ? renderMixedContentAsHtml(textContent) : ""),
    quotedHeaderHtml: escapeHtml(quotedHeader),
    quotedContentHtml:
      message.textHtml ||
      (message.textPlain
        ? convertNewlinesToBr(escapeHtml(message.textPlain))
        : ""),
    text: buildQuotedPlainText({
      textContent,
      quotedHeader,
      quotedContent: quotePlainTextContent(message.textPlain),
    }),
  };
}

export function formatReplyQuotedHeader(
  headers: Pick<ParsedMessage["headers"], "date" | "from">,
) {
  return `On ${formatEmailDate(new Date(headers.date))}, ${headers.from} wrote:`;
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

function detectTextDirection(text: string): "ltr" | "rtl" {
  // Basic RTL detection - checks for RTL characters at the start of the text
  const rtlRegex =
    /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text.trim().charAt(0)) ? "rtl" : "ltr";
}

// Reply bodies are plain text but may carry an HTML signature, so only text
// nodes are escaped and existing markup is kept.
function renderMixedContentAsHtml(content: string): string {
  const $ = load(content, null, false);

  $.root()
    .contents()
    .each((_index, node) => {
      if (node.type !== "text") return;

      $(node).replaceWith(convertNewlinesToBr(escapeHtml(node.data)));
    });

  return $.root().html() ?? "";
}
