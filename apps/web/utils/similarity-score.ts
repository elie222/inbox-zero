import * as stringSimilarity from "string-similarity";
import { parseReply } from "@/utils/mail";

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
  text1?: string | null,
  text2?: string | null,
): number {
  if (!text1 || !text2) {
    return 0.0; // If either text is missing, similarity is 0
  }

  const reply1 = parseReply(text1 || "");
  const reply2 = parseReply(text2 || "");

  const normalized1 = reply1.toLowerCase().trim();
  const normalized2 = reply2.toLowerCase().trim();

  if (!normalized1 || !normalized2) {
    return normalized1 === normalized2 ? 1.0 : 0.0;
  }

  // Calculate and return similarity score
  return stringSimilarity.compareTwoStrings(normalized1, normalized2);
}
