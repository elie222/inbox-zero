import { containsUnsubscribeKeyword } from "@/utils/parse/unsubscribe";

// very similar to apps/web/utils/parse/parseHtml.server.ts
export function findUnsubscribeLink(html?: string | null): string | undefined {
  if (typeof DOMParser === "undefined") return;
  if (!html) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  let unsubscribeLink: string | undefined;

  const links = doc.querySelectorAll("a");
  links.forEach((element) => {
    const text = element.textContent?.toLowerCase() ?? "";
    if (containsUnsubscribeKeyword(text)) {
      unsubscribeLink =
        element.getAttribute("href")?.toLowerCase() ?? undefined;
      return;
    }
  });

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

  return unsubscribeLink;
}
