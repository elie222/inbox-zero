import * as cheerio from "cheerio";

/**
 * Extracts email signature from HTML content for Outlook emails
 * Used to extract signatures from sent emails since Outlook API doesn't support fetching signatures
 * @param htmlContent The HTML content of the email
 * @returns The extracted signature or null if no signature is found
 */
export function extractSignatureFromHtml(htmlContent: string): string | null {
  if (!htmlContent) return null;

  try {
    const $ = cheerio.load(htmlContent);
    const signatureElement = $('[id^="Signature"]');

    if (signatureElement.length > 0) {
      return (
        signatureElement
          .html()
          ?.replace(/&amp;/g, "&")
          .replace(/>\s+/g, ">")
          .replace(/\s+</g, "<")
          .replace(/\s+/g, " ")
          .trim() ?? null
      );
    }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: helpful for debugging
    console.error("Error parsing signature HTML:", error);
  }

  return null;
}
