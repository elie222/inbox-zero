import { JSDOM } from "jsdom";

/**
 * Extracts Gmail signature from email content
 * @param htmlContent The HTML content of the email
 * @returns The extracted signature or null if no signature is found
 */
export function extractGmailSignature(htmlContent: string): string | null {
  if (!htmlContent) return null;

  try {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    const signatureElement = document.querySelector(".gmail_signature");

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
    console.error("Error parsing signature HTML:", error);
  }

  return null;
}
