import { load, type CheerioAPI } from "cheerio";
import type { ParsedMessage } from "@/utils/types";

const SIGNATURE_SELECTORS = [
  ".gmail_signature",
  ".gmail_signature_prefix",
  "[data-smartmail='gmail_signature']",
  "[id^='Signature']",
  "[id^='signature']",
];

const PLAIN_TEXT_SIGNATURE_DELIMITER = /\r?\n-- ?\r?\n/;
const QUOTE_SELECTORS = "blockquote, .gmail_quote";

export function stripProviderSignatureHtml(html: string): string {
  if (!html) return html;

  const $ = load(html, null, looksLikeHtmlDocument(html));
  const signatureElements = $(SIGNATURE_SELECTORS.join(", "));

  if (signatureElements.length === 0) return html;

  signatureElements.each((_index, element) => {
    const $element = $(element);
    removeAdjacentBreaks($, $element);
    $element.remove();
  });

  return $.root().html() ?? html;
}

export function getProviderSignatureHtml(html: string): string {
  if (!html) return "";

  const $ = load(html, null, looksLikeHtmlDocument(html));
  const selector = SIGNATURE_SELECTORS.join(", ");

  return $(selector)
    .filter((_index, element) => $(element).parents(selector).length === 0)
    .toArray()
    .map((element) => $.html(element))
    .join("");
}

// The sender's own signature: quoted messages below it carry other people's.
export function getOwnSignatureHtml(html: string): string {
  if (!html) return "";

  const $ = load(html, null, looksLikeHtmlDocument(html));
  const selector = SIGNATURE_SELECTORS.filter(
    (item) => item !== ".gmail_signature_prefix",
  ).join(", ");
  const signature = $(selector)
    .filter(
      (_index, element) =>
        $(element).parents(`${selector}, ${QUOTE_SELECTORS}`).length === 0,
    )
    .first();

  return signature.html()?.trim() ?? "";
}

export function stripPlainTextSignature(text: string): string {
  const delimiterMatch = text.search(PLAIN_TEXT_SIGNATURE_DELIMITER);
  if (delimiterMatch === -1) return text;

  return text.slice(0, delimiterMatch).trimEnd();
}

export function stripProviderSignatureFromParsedMessage(
  message: ParsedMessage,
): ParsedMessage {
  if (message.textHtml) {
    return {
      ...message,
      textHtml: stripProviderSignatureHtml(message.textHtml),
    };
  }
  if (message.textPlain) {
    return {
      ...message,
      textPlain: stripPlainTextSignature(message.textPlain),
    };
  }
  return message;
}

// Walks raw sibling nodes: cheerio's prev()/next() skip text nodes, which
// would reach past the body text and remove its line breaks.
function removeAdjacentBreaks($: CheerioAPI, element: ReturnType<CheerioAPI>) {
  const node = element.get(0);

  let previous = node?.prev;
  while (previous && isBreakOrEmptyText($(previous))) {
    const current = previous;
    previous = current.prev;
    $(current).remove();
  }

  let next = node?.next;
  while (next && isBreakOrEmptyText($(next))) {
    const current = next;
    next = current.next;
    $(current).remove();
  }
}

function isBreakOrEmptyText(element: ReturnType<CheerioAPI>) {
  if (!element.length) return false;

  const node = element.get(0);
  if (!node) return false;

  if (node.type === "tag") {
    return node.name.toLowerCase() === "br";
  }

  if (node.type === "text") {
    return !node.data.trim();
  }

  return false;
}

function looksLikeHtmlDocument(html: string) {
  return /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
}
