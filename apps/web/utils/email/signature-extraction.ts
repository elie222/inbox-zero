import { JSDOM } from "jsdom";

/**
 * Extracts email signature from HTML content for Outlook emails
 * Used to extract signatures from sent emails since Outlook API doesn't support fetching signatures
 * @param htmlContent The HTML content of the email
 * @returns The extracted signature or null if no signature is found
 */
export function extractSignatureFromHtml(htmlContent: string): string | null {
  if (!htmlContent) return null;

  try {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    // Look for Outlook signature divs
    const signatureElement = document.querySelector('[id^="Signature"]');

    if (signatureElement) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = signatureElement.innerHTML;

      return tempDiv.innerHTML
        .replace(/&amp;/g, "&") // Convert &amp; to &
        .replace(/>\s+/g, ">") // Remove spaces after tags
        .replace(/\s+</g, "<") // Remove spaces before tags
        .replace(/\s+/g, " ") // Normalize remaining whitespace
        .trim();
    }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: helpful for debugging
    console.error("Error parsing signature HTML:", error);
  }

  return null;
}
