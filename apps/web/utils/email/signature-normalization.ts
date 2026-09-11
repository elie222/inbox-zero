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

export function stripProviderSignatureHtml(html: string): string {
  if (!html) return html;

  const $ = load(html, null, looksLikeHtmlDocument(html));
  const signatureElements = $(SIGNATURE_SELECTORS.join(", "));

  if (signatureElements.length === 0) return html;

  signatureElements.each((_index, element) => {
    const $element = $(element);
    removeAdjacentBreaks($element);
    $element.remove();
  });

  return $.root().html() ?? html;
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

function removeAdjacentBreaks(element: ReturnType<CheerioAPI>) {
  let previous = element.prev();
  while (isBreakOrEmptyText(previous)) {
    const current = previous;
    previous = previous.prev();
    current.remove();
  }

  let next = element.next();
  while (isBreakOrEmptyText(next)) {
    const current = next;
    next = next.next();
    current.remove();
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
