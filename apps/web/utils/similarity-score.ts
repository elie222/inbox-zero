import * as stringSimilarity from "string-similarity";
import { convertEmailHtmlToText, parseReply } from "@/utils/mail";
import {
  stripQuotedContent,
  stripQuotedHtmlContent,
} from "@/utils/ai/choose-rule/draft-management";
import {
  stripPlainTextSignature,
  stripProviderSignatureHtml,
} from "@/utils/email/signature-normalization";
import type { ParsedMessage } from "@/utils/types";

const HTML_TAG_NAMES = [
  "html",
  "head",
  "body",
  "div",
  "p",
  "br",
  "a",
  "span",
  "table",
  "tr",
  "td",
  "blockquote",
  "meta",
];

const HTML_TAG_PATTERN = new RegExp(
  `<\\/?(?:${HTML_TAG_NAMES.join("|")})(?:\\s|\\/|>)`,
  "i",
);

/**
 * Normalizes content for Outlook (HTML) comparison.
 * Converts \n to <br> and then to plain text, strips quoted content.
 */
function normalizeForOutlook(content: string, stripSignature = false): string {
  const signatureStripped = stripSignature
    ? stripProviderSignatureHtml(content)
    : content;
  const withBr = signatureStripped.replace(/\n/g, "<br>");
  const plainText = convertEmailHtmlToText({
    htmlText: stripQuotedHtmlContent(withBr),
    includeLinks: false,
  });
  const withoutQuotedContent = stripQuotedContent(plainText);
  const withoutSignature = stripSignature
    ? stripPlainTextSignature(withoutQuotedContent)
    : withoutQuotedContent;
  return withoutSignature.toLowerCase().trim();
}

/**
 * Decodes HTML entities (e.g., &#x1F44B; -> 👋) without modifying other content.
 * Invalid code points (> 0x10FFFF) are left unchanged to avoid RangeError.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint) || codePoint > 0x10_ff_ff) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const codePoint = Number.parseInt(dec, 10);
      if (!Number.isFinite(codePoint) || codePoint > 0x10_ff_ff) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    });
}

/**
 * Normalizes content for Gmail (plain text) comparison.
 * Uses parseReply to extract the reply, decodes HTML entities, and strips quoted content.
 */
function normalizeForGmail(content: string, stripSignature = false): string {
  const signatureStripped = stripSignature
    ? stripProviderSignatureHtml(content)
    : content;
  const plainText = looksLikeHtmlContent(signatureStripped)
    ? convertEmailHtmlToText({
        htmlText: stripQuotedHtmlContent(
          signatureStripped.replace(/\n/g, "<br>"),
        ),
        includeLinks: false,
      })
    : signatureStripped;
  const reply = parseReply(plainText);
  const decoded = decodeHtmlEntities(reply);
  const withoutQuotedContent = stripQuotedContent(decoded);
  const withoutSignature = stripSignature
    ? stripPlainTextSignature(withoutQuotedContent)
    : withoutQuotedContent;
  return withoutSignature.toLowerCase().trim();
}

/**
 * Calculates the similarity between stored draft content and a provider message.
 * Handles Outlook HTML content and properly strips quoted content.
 *
 * @param storedContent The original stored draft content (from executedAction.content)
 * @param providerMessage The message from the email provider (ParsedMessage or plain text)
 * @returns A similarity score between 0.0 and 1.0.
 */
export function calculateSimilarity(
  storedContent?: string | null,
  providerMessage?: string | ParsedMessage | null,
): number {
  if (!storedContent || !providerMessage) {
    return 0.0;
  }

  const [normalized1, normalized2] = normalizePair({
    storedContent,
    providerMessage,
    stripSignature: false,
  });
  const baselineScore = compareNormalizedStrings(normalized1, normalized2);

  const [signatureStripped1, signatureStripped2] = normalizePair({
    storedContent,
    providerMessage,
    stripSignature: true,
  });
  const signatureStrippedScore = compareNormalizedStrings(
    signatureStripped1,
    signatureStripped2,
  );

  return Math.max(baselineScore, signatureStrippedScore);
}

function normalizePair({
  storedContent,
  providerMessage,
  stripSignature,
}: {
  storedContent: string;
  providerMessage: string | ParsedMessage;
  stripSignature: boolean;
}): [string, string] {
  let normalizedStoredContent: string;
  let normalizedProviderMessage: string;

  if (typeof providerMessage === "string") {
    // Legacy: plain string from before ParsedMessage was threaded through callers
    normalizedStoredContent = normalizeForGmail(storedContent, stripSignature);
    normalizedProviderMessage = normalizeForGmail(
      providerMessage,
      stripSignature,
    );
  } else {
    const isOutlook = providerMessage.bodyContentType === "html";
    const text = providerMessage.textHtml || providerMessage.textPlain || "";

    if (isOutlook) {
      normalizedStoredContent = normalizeForOutlook(
        storedContent,
        stripSignature,
      );
      normalizedProviderMessage = normalizeForOutlook(text, stripSignature);
    } else {
      normalizedStoredContent = normalizeForGmail(
        storedContent,
        stripSignature,
      );
      normalizedProviderMessage = normalizeForGmail(text, stripSignature);
    }
  }

  return [normalizedStoredContent, normalizedProviderMessage];
}

function compareNormalizedStrings(normalized1: string, normalized2: string) {
  if (!normalized1 || !normalized2) {
    return normalized1 === normalized2 ? 1.0 : 0.0;
  }

  return stringSimilarity.compareTwoStrings(normalized1, normalized2);
}

function looksLikeHtmlContent(content: string): boolean {
  if (/<!doctype html/i.test(content)) return true;
  return HTML_TAG_PATTERN.test(content);
}
