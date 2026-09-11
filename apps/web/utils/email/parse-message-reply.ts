import { load } from "cheerio";
import type { ParsedMessage } from "@/utils/types";
import { convertEmailHtmlToText, parseReply } from "@/utils/mail";

export function parseMessageReply(message: ParsedMessage): ParsedMessage {
  const parsedTextPlain = parseReply(message.textPlain || "").trim();
  const parsedTextHtml = message.textHtml
    ? parseReply(
        convertEmailHtmlToText({
          htmlText: stripQuotedHtmlContent(message.textHtml),
          includeLinks: false,
        }),
      ).trim()
    : "";

  return {
    ...message,
    textPlain: parsedTextPlain || parsedTextHtml,
    textHtml: parsedTextHtml,
  };
}

export function stripQuotedHtmlContent(html: string): string {
  const $ = load(html, null, false);

  $(
    [
      ".gmail_quote_container",
      ".gmail_quote",
      ".gmail_attr",
      "blockquote[type='cite']",
    ].join(", "),
  ).remove();

  return $.root().html() || html;
}
