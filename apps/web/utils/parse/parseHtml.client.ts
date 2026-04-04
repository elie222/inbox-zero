import { containsCtaKeyword } from "@/utils/parse/cta";

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
