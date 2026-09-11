import { containsCtaKeyword } from "@/utils/parse/cta";

export function findCtaLink(
  html?: string | null,
): { ctaText: string; ctaLink: string } | undefined {
  if (typeof DOMParser === "undefined") return;
  if (!html) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const links = doc.querySelectorAll("a");
  for (const element of links) {
    if (!element.textContent) continue;
    if (containsCtaKeyword(element.textContent.toLowerCase())) {
      const ctaLink = normalizeCtaLink(element.getAttribute("href"));
      if (!ctaLink) continue;

      const ctaText =
        element.textContent.charAt(0).toUpperCase() +
        element.textContent.slice(1);
      return { ctaText, ctaLink };
    }
  }
}

function normalizeCtaLink(link: string | null): string | undefined {
  const trimmedLink = link?.trim();
  if (!trimmedLink || trimmedLink.startsWith("/")) return;

  const normalizedLink = /^[a-z][a-z\d+.-]*:/i.test(trimmedLink)
    ? trimmedLink
    : `https://${trimmedLink}`;

  try {
    const protocol = new URL(normalizedLink).protocol;
    if (protocol !== "http:" && protocol !== "https:" && protocol !== "mailto:")
      return;
  } catch {
    return;
  }

  return normalizedLink;
}
