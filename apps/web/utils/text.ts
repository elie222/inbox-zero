import type { PortableTextBlock } from "@portabletext/react";
import type { PortableTextSpan } from "sanity";
import * as stringSimilarity from "string-similarity";
import { parseReply } from "@/utils/mail";

export const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
};

export const extractTextFromPortableTextBlock = (
  block: PortableTextBlock,
): string => {
  return block.children
    .filter(
      (child): child is PortableTextSpan =>
        typeof child === "object" && "_type" in child && "text" in child,
    )
    .map((child) => child.text)
    .join("");
};

/**
 * Extracts the main reply content from an email's plain text body
 * using email-reply-parser.
 * @param text The plain text email body.
 * @returns The extracted reply content.
 */
function extractReplyContent(text: string): string {
  if (!text) return "";
  // Use the more robust parseReply function from mail utils
  return parseReply(text); // Use parseReply
}

/**
 * Calculates the similarity between two strings using Dice Coefficient.
 * It first attempts to extract the main reply content from each string
 * and then normalizes the text before comparison.
 *
 * @param text1 The first string (e.g., original draft content).
 * @param text2 The second string (e.g., sent message content).
 * @returns A similarity score between 0.0 and 1.0.
 */
export function calculateSimilarity(
  text1: string | null | undefined,
  text2: string | null | undefined,
): number {
  if (!text1 || !text2) {
    return 0.0; // If either text is missing, similarity is 0
  }

  // Extract reply content using the updated function
  const reply1 = extractReplyContent(text1);
  const reply2 = extractReplyContent(text2);

  // Normalize text (lowercase, trim)
  const normalized1 = reply1.toLowerCase().trim();
  const normalized2 = reply2.toLowerCase().trim();

  // Handle cases where extracted content might be empty after processing
  if (!normalized1 || !normalized2) {
      return normalized1 === normalized2 ? 1.0 : 0.0;
  }

  // Calculate and return similarity score
  return stringSimilarity.compareTwoStrings(normalized1, normalized2);
}
