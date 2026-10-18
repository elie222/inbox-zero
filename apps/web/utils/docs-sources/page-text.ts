import { convert, type FormatCallback } from "html-to-text";
import { isUrlInDocsSources } from "@/utils/docs-sources/url";

const MAX_LINKS = 50;

/**
 * Converts a docs HTML page to readable text, keeping only the main content
 * when the page marks it, and lists the in-scope links so the reader can
 * navigate sites that publish no page index.
 */
export function docsHtmlToText(
  html: string,
  pageUrl: string,
  sources: string[],
): { text: string; links: string[] } {
  const links = new Set<string>();

  const collectLink: FormatCallback = (elem, walk, builder) => {
    const href = elem.attribs?.href;
    const url = href ? resolveUrl(href, pageUrl) : null;
    if (url && url !== pageUrl && isUrlInDocsSources(url, sources)) {
      links.add(url);
    }
    walk(elem.children, builder);
  };

  const text = convert(html, {
    wordwrap: false,
    baseElements: {
      selectors: ["main", "article", "[role=main]", "body"],
      returnDomByDefault: true,
    },
    limits: { maxBaseElements: 1 },
    formatters: { collectLink },
    selectors: [
      { selector: "a", format: "collectLink" },
      { selector: "img", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "header", format: "skip" },
      { selector: "footer", format: "skip" },
      { selector: "aside", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "svg", format: "skip" },
    ],
  });

  return { text: text.trim(), links: [...links].slice(0, MAX_LINKS) };
}

function resolveUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
