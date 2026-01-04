import * as stringSimilarity from "string-similarity";
import { convertEmailHtmlToText, parseReply } from "@/utils/mail";
import { stripQuotedContent } from "@/utils/ai/choose-rule/draft-management";
import type { ParsedMessage } from "@/utils/types";

/**
 * Normalizes stored draft content for comparison.
 * Converts \n to <br> and then to plain text (same as isDraftUnmodified).
 */
function normalizeStoredContent(content: string): string {
  const withBr = content.replace(/\n/g, "<br>");
  const plainText = convertEmailHtmlToText({
    htmlText: withBr,
    includeLinks: false,
  });
  return stripQuotedContent(plainText).toLowerCase().trim();
}

/**
 * Normalizes email provider response for comparison.
 * Handles Outlook HTML (bodyContentType='html') and strips quoted content.
 */
function normalizeProviderContent(
  text: string,
  bodyContentType?: "html" | "text",
): string {
  // If the provider returns HTML (Outlook case), convert to plain text
  const plainText =
    bodyContentType === "html"
      ? convertEmailHtmlToText({ htmlText: text, includeLinks: false })
      : text;

  return stripQuotedContent(plainText).toLowerCase().trim();
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

  // Normalize stored content
  const normalized1 = normalizeStoredContent(storedContent);

  // Handle both ParsedMessage and plain string
  let normalized2: string;
  if (typeof providerMessage === "string") {
    // Legacy: plain string - use parseReply for backwards compatibility with Gmail
    const reply = parseReply(providerMessage);
    normalized2 = reply.toLowerCase().trim();
  } else {
    // ParsedMessage - use proper normalization with bodyContentType
    // Fall back to textHtml if textPlain is empty (some emails only have HTML)
    const text = providerMessage.textPlain || providerMessage.textHtml || "";
    const contentType = providerMessage.textPlain
      ? providerMessage.bodyContentType
      : "html";
    normalized2 = normalizeProviderContent(text, contentType);
  }

  if (!normalized1 || !normalized2) {
    return normalized1 === normalized2 ? 1.0 : 0.0;
  }

  return stringSimilarity.compareTwoStrings(normalized1, normalized2);
}
