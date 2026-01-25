import { containsCtaKeyword } from "@/utils/parse/cta";
import {
  containsUnsubscribeKeyword,
  containsUnsubscribeUrlPattern,
} from "@/utils/parse/unsubscribe";

// very similar to apps/web/utils/parse/parseHtml.server.ts
export function findUnsubscribeLink(html?: string | null): string | undefined {
  if (typeof DOMParser === "undefined") return;
  if (!html) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  let unsubscribeLink: string | undefined;

  const links = doc.querySelectorAll("a");
  for (const element of links) {
    const text = element.textContent?.toLowerCase() ?? "";
    if (containsUnsubscribeKeyword(text)) {
      unsubscribeLink = element.getAttribute("href") ?? undefined;
      break;
    }

    const href = element.getAttribute("href") ?? "";
    if (containsUnsubscribeUrlPattern(href)) {
      unsubscribeLink = href;
      break;
    }
  }

  if (!unsubscribeLink) {
    // If unsubscribe link not found in direct anchor tags, check for text nodes containing unsubscribe text
    const allNodes = Array.from(doc.body.getElementsByTagName("*"));
    for (const node of allNodes) {
      if (node.nodeType === 3 && node.textContent?.includes("unsubscribe")) {
        // text node
        const parent = node.parentNode;
        if (parent) {
          const linkElement = parent.querySelector("a");
          if (linkElement) {
            unsubscribeLink = linkElement.getAttribute("href") ?? undefined;
            break;
          }
        }
      }
    }
  }

  return cleanUnsubscribeLink(unsubscribeLink);
}

export function findCtaLink(
  html?: string | null,
): { ctaText: string; ctaLink: string } | undefined {
  if (typeof DOMParser === "undefined") return;
  if (!html) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  let ctaText: string | undefined;
  let ctaLink: string | undefined;

  const links = doc.querySelectorAll("a");
  for (const element of links) {
    if (!element.textContent) continue;
    if (containsCtaKeyword(element.textContent.toLowerCase())) {
      // capitalise first letter
      ctaText =
        element.textContent.charAt(0).toUpperCase() +
        element.textContent.slice(1);
      ctaLink = element.getAttribute("href") ?? undefined;
      return;
    }
  }

  if (ctaLink && !ctaLink.startsWith("http") && !ctaLink.startsWith("mailto:"))
    ctaLink = `https://${ctaLink}`;

  return ctaText && ctaLink ? { ctaText, ctaLink } : undefined;
}

export function htmlToText(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

// Remove replies from `textPlain` email content.
// `Content. On Wed, Feb 21, 2024 at 10:10 AM ABC <abc@gmail.com> wrote: XYZ.`
// This function returns "Content."
export function removeReplyFromTextPlain(text: string) {
  return text.split(/(On[\s\S]*?wrote:)/)[0];
}

export function isMarketingEmail(html: string) {
  if (typeof DOMParser === "undefined") return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // contains centered table
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const table of tables) {
    if (table.getAttribute("align") === "center") {
      return true;
    }
  }
}

export function cleanUnsubscribeLink(unsubscribeLink?: string) {
  // remove < > from start and end of unsubscribeLink
  let cleanedLink = unsubscribeLink;
  if (cleanedLink?.startsWith("<")) cleanedLink = cleanedLink.slice(1);
  if (cleanedLink?.endsWith(">")) cleanedLink = cleanedLink.slice(0, -1);
  return cleanedLink;
}
