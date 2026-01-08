import * as stringSimilarity from "string-similarity";
import { convertEmailHtmlToText, parseReply } from "@/utils/mail";
import { stripQuotedContent } from "@/utils/ai/choose-rule/draft-management";
import type { ParsedMessage } from "@/utils/types";

/**
 * Normalizes content for Outlook (HTML) comparison.
 * Converts \n to <br> and then to plain text, strips quoted content.
 */
function normalizeForOutlook(content: string): string {
  const withBr = content.replace(/\n/g, "<br>");
  const plainText = convertEmailHtmlToText({
    htmlText: withBr,
    includeLinks: false,
  });
  return stripQuotedContent(plainText).toLowerCase().trim();
}

/**
 * Normalizes content for Gmail (plain text) comparison.
 * Uses parseReply to extract the reply and strips quoted content.
 */
function normalizeForGmail(content: string): string {
  const reply = parseReply(content);
  return reply.toLowerCase().trim();
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

  let normalized1: string;
  let normalized2: string;

  if (typeof providerMessage === "string") {
    // Legacy: plain string - use Gmail normalization (parseReply) for both
    normalized1 = normalizeForGmail(storedContent);
    normalized2 = normalizeForGmail(providerMessage);
  } else {
    // ParsedMessage - check bodyContentType to determine normalization strategy
    const isOutlook = providerMessage.bodyContentType === "html";
    const text = providerMessage.textPlain || providerMessage.textHtml || "";

    if (isOutlook) {
      // Outlook: use HTML-aware normalization for both
      normalized1 = normalizeForOutlook(storedContent);
      normalized2 = normalizeForOutlook(text);
    } else {
      // Gmail: use parseReply normalization for both
      normalized1 = normalizeForGmail(storedContent);
      normalized2 = normalizeForGmail(text);
    }
  }

  if (!normalized1 || !normalized2) {
    return normalized1 === normalized2 ? 1.0 : 0.0;
  }

  return stringSimilarity.compareTwoStrings(normalized1, normalized2);
}
